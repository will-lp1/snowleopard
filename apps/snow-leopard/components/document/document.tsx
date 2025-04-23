import { memo, useState, useCallback } from 'react';

import type { ArtifactKind } from '@/components/artifact';
import { FileIcon, LoaderIcon, MessageIcon, PencilEditIcon, CheckIcon } from '@/components/icons';
import { toast } from 'sonner';
import { useArtifact } from '@/hooks/use-artifact';
import { DiffView } from './diffview';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const getActionText = (
  type: 'create' | 'update' | 'request-suggestions',
  tense: 'present' | 'past',
) => {
  switch (type) {
    case 'create':
      return tense === 'present' ? 'Creating' : 'Created';
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
  type: 'create' | 'update' | 'request-suggestions';
  result: {
    id: string;
    title: string;
    kind: ArtifactKind;
    originalContent?: string;
    newContent?: string;
    status?: string;
    error?: string;
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
    if (!result.newContent || !result.id) return;
    
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
  }, [result.id, result.newContent]);

  const handleOpenDocument = useCallback((event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    if (isReadonly) {
      toast.error('Viewing files in shared chats is currently not supported.');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const boundingBox = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };

    setArtifact({
      documentId: result.id,
      kind: result.kind,
      content: '',
      title: result.title,
      isVisible: true,
      status: 'idle',
      boundingBox,
    });
  }, [isReadonly, result, setArtifact]);

  if (result.error) {
     return (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm py-2 px-3 rounded-xl w-fit flex flex-col gap-1 items-start">
           <span>{`Failed to ${type} document:`}</span>
           <span className="text-xs font-mono">{result.error}</span>
        </div>
     )
  }

  if (!isUpdateProposal) {
    return (
      <button
        type="button"
        className="bg-background cursor-pointer border py-2 px-3 rounded-xl w-fit flex flex-row gap-3 items-start text-sm hover:bg-muted/50 transition-colors"
        onClick={handleOpenDocument}
      >
        <div className="text-muted-foreground mt-0.5">
          {type === 'create' ? (
            <FileIcon />
          ) : type === 'update' && !isUpdateProposal ? (
            <PencilEditIcon />
          ) : type === 'request-suggestions' ? (
            <MessageIcon />
          ) : null}
        </div>
        <div className="text-left">
          {`${getActionText(type, 'past')} "${result.title}"`}
          {result.status && !result.error && <span className="text-xs text-muted-foreground ml-1">({result.status})</span>} 
        </div>
      </button>
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
  type: 'create' | 'update' | 'request-suggestions';
  args: { title: string };
  isReadonly: boolean;
}

function PureDocumentToolCall({
  type,
  args,
  isReadonly,
}: DocumentToolCallProps) {
  const { setArtifact } = useArtifact();

  return (
    <button
      type="button"
      className="cursor pointer w-fit border py-2 px-3 rounded-xl flex flex-row items-start justify-between gap-3"
      onClick={(event) => {
        if (isReadonly) {
          toast.error(
            'Viewing files in shared chats is currently not supported.',
          );
          return;
        }

        const rect = event.currentTarget.getBoundingClientRect();

        const boundingBox = {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };

        setArtifact((currentArtifact) => ({
          ...currentArtifact,
          isVisible: true,
          boundingBox,
        }));
      }}
    >
      <div className="flex flex-row gap-3 items-start">
        <div className="text-zinc-500 mt-1">
          {type === 'create' ? (
            <FileIcon />
          ) : type === 'update' ? (
            <PencilEditIcon />
          ) : type === 'request-suggestions' ? (
            <MessageIcon />
          ) : null}
        </div>

        <div className="text-left">
          {`${getActionText(type, 'present')} ${args.title ? `"${args.title}"` : ''}`}
        </div>
      </div>

      <div className="animate-spin mt-1">{<LoaderIcon />}</div>
    </button>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall, () => true);
