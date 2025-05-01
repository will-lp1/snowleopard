'use client';

import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/document/diffview';
import { DocumentSkeleton } from '@/components/document/document-skeleton';
import { Editor } from '@/components/document/text-editor';
import {
  CheckIcon,
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/icons';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getActiveEditorView } from '@/lib/editor/editor-state';
import { documentSchema } from '@/lib/editor/config';

interface TextArtifactMetadata {
  [key: string]: any;
}

export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'text-delta') {
      const editorView = getActiveEditorView();
      if (editorView) {
        const textDelta = streamPart.content as string;
        const { state } = editorView;
        const insertPos = state.doc.content.size; 
        
        try {
           const transaction = state.tr.insertText(textDelta, insertPos);
           editorView.dispatch(transaction);
        } catch (error) {
           console.error("[TextArtifact Client] Error dispatching stream transaction:", error);
        }
      } else {
        console.warn("[TextArtifact Client] No active editor view found to insert stream delta.");
      }
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
    documentId,
  }) => {
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

    return (
      <div className="px-8 py-10 max-w-4xl mx-auto">
        {isCurrentVersion && mode === 'edit' ? (
          <Editor
            content={content}
            documentId={documentId}
            status={'idle'}
            isCurrentVersion={isCurrentVersion}
            currentVersionIndex={currentVersionIndex}
            initialLastSaved={null}
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
      isDisabled: ({ currentVersionIndex }) => {
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
  toolbar: [],
});
