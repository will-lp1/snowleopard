import { memo, useState, useCallback } from 'react';

import type { ArtifactKind } from '@/components/artifact';
import { FileIcon, LoaderIcon, MessageIcon, PencilEditIcon, CheckIcon, CheckCircleFillIcon } from '@/components/icons';
import { toast } from 'sonner';
import { useArtifact } from '@/hooks/use-artifact';
import { DiffView } from './diffview';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const getActionText = (
  type: 'create' | 'stream' | 'update' | 'request-suggestions',
  tense: 'present' | 'past',
) => {
  switch (type) {
    case 'create':
      return tense === 'present' ? 'Creating document' : 'Created';
    case 'stream':
      return tense === 'present' ? 'Streaming content for' : 'Streamed';
    case 'update':
      return tense === 'present' ? 'Updating' : 'Updated';
    case 'request-suggestions':
      return tense === 'present'
        ? 'Adding suggestions'
        : 'Added suggestions to';
    default:
      return null;
  }
};

interface DocumentToolResultProps {
  type: 'create' | 'stream' | 'update' | 'request-suggestions';
  result: {
    id?: string;
    title?: string;
    kind?: ArtifactKind;
    originalContent?: string;
    newContent?: string;
    status?: string;
    error?: string;
    content?: string;
  };
  isReadonly: boolean;
}

function PureDocumentToolResult({
  type,
  result,
  isReadonly,
}: DocumentToolResultProps) {
  const { setArtifact } = useArtifact();
  const [isApplied, setIsApplied] = useState(false);

  const isUpdateProposal = 
    type === 'update' && 
    result.originalContent !== undefined && 
    result.newContent !== undefined &&
    result.originalContent !== result.newContent;

  const handleApplyUpdate = useCallback(() => {
    if (type !== 'update' || !result.newContent || !result.id) return;
    
    console.log(`[DocumentToolResult] Dispatching apply-document-update for ${result.id}`);
    const event = new CustomEvent('apply-document-update', {
      detail: {
        documentId: result.id,
        newContent: result.newContent,
      }
    });
    window.dispatchEvent(event);
    setIsApplied(true);
    toast.success('Changes applied to the editor.');
  }, [result.id, result.newContent, type]);

  if (result.error) {
     return (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm py-2 px-3 rounded-xl w-fit flex flex-col gap-1 items-start">
           <span>{`Failed to ${type} document:`}</span>
           <span className="text-xs font-mono">{result.error}</span>
        </div>
     )
  }

  if (type === 'create') {
    const message = result.content || 'Document initialized successfully.';
    return (
      <div className="bg-green-50 border border-green-200 text-green-800 text-sm py-2 px-3 rounded-xl w-fit flex items-center gap-2">
        <CheckCircleFillIcon size={16} />
        <span>{message}</span>
      </div>
    );
  }

  if (type === 'stream') {
    const message = result.content || 'Content generation completed.';
    return (
      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm py-2 px-3 rounded-xl w-fit flex items-center gap-2">
        <CheckCircleFillIcon size={16} />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="bg-background border rounded-xl w-full max-w-md flex flex-col items-start text-sm overflow-hidden">
      <div className="p-3 flex flex-row gap-3 items-start w-full border-b bg-muted/30">
        <div className="text-muted-foreground mt-0.5">
          <PencilEditIcon />
        </div>
        <div className="text-left flex-grow">
          {`Proposed update for "${result.title}"`}
          {result.status && <span className="text-xs text-muted-foreground ml-1">({result.status})</span>} 
        </div>
      </div>

      <div className="p-3 w-full max-h-60 overflow-y-auto text-xs">
        <DiffView 
          oldContent={result.originalContent ?? ''} 
          newContent={result.newContent ?? ''} 
        />
      </div>

      <div className="p-2 border-t w-full flex justify-end bg-muted/30">
        <Button
          size="sm"
          onClick={handleApplyUpdate}
          disabled={isApplied}
          className={cn(
            "text-xs flex items-center",
            isApplied && "bg-green-600 hover:bg-green-700 text-white"
          )}
        >
          <span className="mr-1.5">
            <CheckIcon size={14} />
          </span>
          {isApplied ? 'Applied' : 'Apply Changes'}
        </Button>
      </div>
    </div>
  );
}

export const DocumentToolResult = memo(PureDocumentToolResult, () => true);

interface DocumentToolCallProps {
  type: 'create' | 'stream' | 'update' | 'request-suggestions';
  args: { title: string };
  isReadonly: boolean;
}

function PureDocumentToolCall({
  type,
  args = { title: '' },
  isReadonly,
}: DocumentToolCallProps) {
  const { setArtifact, artifact: localArtifact } = useArtifact();
  const artTitle = localArtifact?.title ?? '';

  const titleArg = args.title ?? '';
  const displayTitle = type === 'create' && artTitle.trim()
    ? artTitle
    : titleArg.trim();

  return (
    <div 
      className="w-fit border py-2 px-3 rounded-xl flex flex-row items-start justify-between gap-3" 
    >
      <div className="flex flex-row gap-3 items-start">
        <div className="text-zinc-500 mt-1">
          {type === 'create' ? (
            <FileIcon />
          ) : type === 'stream' ? (
            <LoaderIcon />
          ) : type === 'update' ? (
            <PencilEditIcon />
          ) : type === 'request-suggestions' ? (
            <MessageIcon />
          ) : null}
        </div>

        <div className="text-left">
          {`${getActionText(type, 'present')}`}{' '}
          {displayTitle ? `"${displayTitle}"` : '(active document)'}
        </div>
      </div>

      <div className="animate-spin mt-1">{<LoaderIcon />}</div>
    </div>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall, () => true);
