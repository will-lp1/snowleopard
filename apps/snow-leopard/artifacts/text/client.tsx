'use client';

import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/document/diffview';
import { Editor } from '@/components/document/text-editor';
import {
  ClockRewind,
  RedoIcon,
  UndoIcon,
  CopyIcon,
} from '@/components/icons';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Markdown } from '@/components/markdown';
import { useGT } from 'gt-next';

interface TextArtifactMetadata {
  [key: string]: any;
}

export const getTextArtifact = (t: (content: string) => string) => new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: t('Useful for text content, like drafting essays and emails.'),
  onStreamPart: () => {
    // No-op: handled by creationStreamingPlugin
  },
  content: ({ mode, content, isCurrentVersion, currentVersionIndex, isLoading, getDocumentContentById, documentId }) => {
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
            status="idle"
            isCurrentVersion={isCurrentVersion}
            currentVersionIndex={currentVersionIndex}
            initialLastSaved={null}
          />
        ) : (
          <div className="prose dark:prose-invert">
            <Markdown>{content}</Markdown>
          </div>
        )}
      </div>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: t('View changes'),
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
      description: t('View Previous version'),
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
      description: t('View Next version'),
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
      description: t('Copy to clipboard'),
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success(t('Copied to clipboard!'));
      },
    },
  ],
  toolbar: [],
});
