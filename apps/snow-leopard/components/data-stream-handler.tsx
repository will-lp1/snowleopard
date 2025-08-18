'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getArtifactDefinitions, ArtifactKind } from './artifact';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';
import { useGT } from 'gt-next';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'artifactUpdate'
    | 'force-save';
  content: string;
};

// Define interface for metadata - remove suggestion fields
interface StreamMetadata {
  originalContent?: string; 
  [key: string]: any;
}

export function DataStreamHandler({ id }: { id: string }) {
  const t = useGT();
  const router = useRouter();
  const { data: dataStream } = useChat({ id });
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      const artifactDefinitions = getArtifactDefinitions(t);
      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'text-delta':
            if (typeof window !== 'undefined' && draftArtifact.documentId) {
              window.dispatchEvent(
                new CustomEvent('editor:stream-text', {
                  detail: {
                    documentId: draftArtifact.documentId,
                    content: delta.content,
                  },
                }),
              );
            }
            return draftArtifact;

          case 'id':
            console.log(`[DataStreamHandler] Received ID delta: ${delta.content}. Updating artifact state.`);
            const newDocId = delta.content;
            console.log(`[DataStreamHandler] Navigating to /documents/${newDocId}`);
            router.push(`/documents/${newDocId}`);
            return {
              ...draftArtifact,
              documentId: newDocId,
            };

          case 'force-save':
            if (draftArtifact.documentId && draftArtifact.documentId !== 'init') {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('editor:force-save-document', {
                  detail: { documentId: draftArtifact.documentId }
                }));
              }
            }
            return draftArtifact;

          case 'finish':
            if (draftArtifact.status === 'streaming' && draftArtifact.documentId !== 'init') {
                console.log(`[DataStreamHandler] Dispatching creation-stream-finished for ${draftArtifact.documentId}`);
                window.dispatchEvent(new CustomEvent('editor:creation-stream-finished', {
                    detail: { documentId: draftArtifact.documentId }
                }));
            }
            return {
              ...draftArtifact,
              status: 'idle',
            };

          case 'artifactUpdate':
            try {
              const updateData = JSON.parse(delta.content as string);
              console.log('[DataStreamHandler] Received artifactUpdate, dispatching to editor:', updateData);
              
              if (typeof window !== 'undefined') {
                console.log('[DataStreamHandler] Window context confirmed. Attempting to dispatch editor:stream-data...');
                try {
                  window.dispatchEvent(new CustomEvent('editor:stream-data', {
                    detail: { type: 'artifactUpdate', content: delta.content }
                  }));
                  console.log('[DataStreamHandler] Dispatched editor:stream-data successfully.', { detail: { type: 'artifactUpdate', content: delta.content } });
                } catch (dispatchError) {
                  console.error('[DataStreamHandler] Error dispatching editor:stream-data:', dispatchError);
                }
              } else {
                console.warn('[DataStreamHandler] Window context not found. Cannot dispatch event.');
              }
            } catch (error) {
              console.error('[DataStreamHandler] Error parsing artifactUpdate content:', error);
            }
            return draftArtifact;

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact, router]);

  return null;
}
