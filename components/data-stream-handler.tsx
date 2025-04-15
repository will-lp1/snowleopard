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
    | 'original-content'
    | 'new-content'
    | 'diff-ready';
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
  
  // Refs to store diff content pieces temporarily during streaming
  const originalContentRef = useRef<string | null>(null);
  const newContentRef = useRef<string | null>(null);

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

          case 'original-content':
            originalContentRef.current = delta.content as string;
            console.log('[DataStream] Received original-content');
            return draftArtifact;

          case 'new-content':
            newContentRef.current = delta.content as string;
            console.log('[DataStream] Received new-content');
            return draftArtifact;

          case 'diff-ready':
            console.log('[DataStream] Received diff-ready signal');
            if (originalContentRef.current !== null && newContentRef.current !== null) {
              try {
                const diffData = JSON.parse(delta.content as string);
                console.log('[DataStream] Dispatching editor:show-diff event:', diffData);
                
                // Dispatch event for LexicalEditor to pick up
                window.dispatchEvent(new CustomEvent('editor:show-diff', {
                  detail: {
                    type: 'documentDiff',
                    documentId: diffData.documentId,
                    title: diffData.title,
                    originalContent: originalContentRef.current,
                    newContent: newContentRef.current,
                  }
                }));
                
                // Reset refs after dispatching
                originalContentRef.current = null;
                newContentRef.current = null;
                
              } catch (error) {
                console.error('[DataStream] Error parsing diff-ready content:', error);
                // Reset refs on error too
                originalContentRef.current = null;
                newContentRef.current = null;
              }
            } else {
              console.warn('[DataStream] Received diff-ready but missing content parts.');
              // Reset refs if something went wrong
              originalContentRef.current = null;
              newContentRef.current = null;
            }
            return draftArtifact;

          case 'finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact]);

  return null;
}
