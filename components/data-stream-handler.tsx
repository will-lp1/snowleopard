'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { artifactDefinitions, ArtifactKind } from './artifact';
import { Suggestion } from '@/lib/db/schema';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'suggestion-delta'
    | 'original'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'artifactUpdate';
  content: string | Suggestion;
};

// Define interface for metadata with our new fields
interface SuggestionMetadata {
  originalContent?: string;
  pendingSuggestion?: string;
  suggestions?: Suggestion[];
  [key: string]: any;
}

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream } = useChat({ id });
  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
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
          case 'id':
            return {
              ...draftArtifact,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            return {
              ...draftArtifact,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            return {
              ...draftArtifact,
              kind: delta.content as ArtifactKind,
              status: 'streaming',
            };

          case 'clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };
            
          case 'original':
            // Store original content in metadata for diff view
            setMetadata((prevMetadata: SuggestionMetadata) => ({
              ...prevMetadata,
              originalContent: delta.content as string,
              pendingSuggestion: ''
            }));
            return draftArtifact;
            
          case 'suggestion-delta':
            // Accumulate the suggestion in metadata for direct overlay
            setMetadata((prevMetadata: SuggestionMetadata) => ({
              ...prevMetadata,
              pendingSuggestion: (prevMetadata.pendingSuggestion || '') + (delta.content as string)
            }));
            return draftArtifact;

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          case 'artifactUpdate':
            try {
              const updateData = JSON.parse(delta.content as string);
              console.log('[DataStreamHandler] Received artifactUpdate, dispatching to editor:', updateData);
              
              // Verify running client-side before dispatch
              if (typeof window !== 'undefined') {
                console.log('[DataStreamHandler] Window context confirmed. Attempting to dispatch editor:stream-data...');
                try {
                  // Dispatch the data directly for the editor to consume
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
            // No state change needed here, just dispatching the event
            return draftArtifact;

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact]);

  return null;
}
