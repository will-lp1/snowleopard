'use client';

import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/diffview';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { Editor } from '@/components/text-editor';
import {
  CheckIcon,
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/icons';
import { Suggestion } from '@/lib/db/schema';
import { toast } from 'sonner';
import { getSuggestions } from '../actions';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface TextArtifactMetadata {
  suggestions: Array<Suggestion>;
  originalContent?: string;
  pendingSuggestion?: string;
}

export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata }) => {
    console.log('Initializing text artifact with doc ID:', documentId);
    const suggestions = await getSuggestions({ documentId });

    setMetadata({
      suggestions: suggestions.map(s => ({
        ...s
      })),
      originalContent: '',
      pendingSuggestion: ''
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'suggestion') {
      setMetadata((metadata) => {
        const suggestion = streamPart.content as Suggestion;
        return {
          ...metadata,
          suggestions: [
            ...metadata.suggestions,
            {
              ...suggestion
            }
          ],
        };
      });
    }

    if (streamPart.type === 'suggestion-delta') {
      setMetadata((metadata) => {
        return {
          ...metadata,
          pendingSuggestion: (metadata.pendingSuggestion || '') + (streamPart.content as string)
        };
      });
    }

    if (streamPart.type === 'original') {
      setMetadata((metadata) => {
        return {
          ...metadata,
          originalContent: streamPart.content as string,
          pendingSuggestion: ''
        };
      });
    }
    
    if (streamPart.type === 'text-delta') {
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + (streamPart.content as string),
          isVisible:
            draftArtifact.status === 'streaming' &&
            draftArtifact.content.length > 400 &&
            draftArtifact.content.length < 450
              ? true
              : draftArtifact.isVisible,
          status: 'streaming',
        };
      });
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
    setMetadata,
    documentId,
  }) => {
    const [diffHighlights, setDiffHighlights] = useState<any>();

    useEffect(() => {
      if (mode === 'diff' && !isCurrentVersion) {
        // We would calculate diff highlights here, but it's not implemented
      }
    }, [mode, currentVersionIndex, isCurrentVersion, content, getDocumentContentById]);

    if (isLoading) {
      return (
        <div className="px-8 py-10 max-w-4xl mx-auto">
          <Skeleton className="h-6 w-2/3 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-6" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      );
    }

    if (mode === 'diff') {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView oldContent={oldContent} newContent={newContent} />;
    }

    const hasUnresolvedSuggestions = metadata?.suggestions?.some(s => !s.isResolved) ?? false;

    const handleSuggestionResolve = (suggestionId: string, shouldApply: boolean) => {
      if (!metadata?.suggestions) return;

      setMetadata(prevMetadata => ({
        ...prevMetadata,
        suggestions: prevMetadata.suggestions.map(s => 
          s.id === suggestionId 
            ? { ...s, isResolved: true }
            : s
        )
      }));

      if (shouldApply) {
        const suggestion = metadata.suggestions.find(s => s.id === suggestionId);
        if (suggestion) {
          const updatedContent = content.replace(
            suggestion.originalText,
            suggestion.suggestedText
          );
          onSaveContent(updatedContent, false);
        }
      }
    };

    return (
      <div className="px-8 py-10 max-w-4xl mx-auto">
        {isCurrentVersion && mode === 'edit' ? (
          <Editor
            content={content}
            onSaveContent={onSaveContent}
            status={status}
            isCurrentVersion={isCurrentVersion}
            currentVersionIndex={currentVersionIndex}
            suggestions={metadata ? metadata.suggestions.filter(s => !s.isResolved) : []}
            onSuggestionResolve={handleSuggestionResolve}
            documentId={documentId}
          />
        ) : (
          <div className="prose dark:prose-invert">
            {content.split('\n').map((line, index) => (
              <div key={index}>{line || <br />}</div>
            ))}
          </div>
        )}
      </div>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: 'View changes',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('toggle');
      },
      isDisabled: ({ currentVersionIndex, setMetadata }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy to clipboard',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard!');
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: 'Add final polish',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.',
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add suggestions you have that could improve the writing.',
        });
      },
    },
  ],
});
