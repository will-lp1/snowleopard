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
      return tense === 'present' ? 'Creating document' : 'Document created';
    case 'stream':
      return tense === 'present' ? 'Streaming content for' : 'Content streamed for';
    case 'update':
      return tense === 'present' ? 'Proposing update for' : 'Update proposed for';
    case 'request-suggestions':
      return tense === 'present'
        ? 'Adding suggestions for'
        : 'Suggestions added to';
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
        <div className="bg-background border border-destructive/50 rounded-xl w-full max-w-md flex flex-row items-center text-sm overflow-hidden p-3 gap-3">
          <div className="text-destructive flex-shrink-0">
            <MessageIcon size={16} /> 
          </div>
          <div className="flex-grow">
            <div className="text-destructive font-medium">
              {`Failed to ${type} document${result.title ? ` "${result.title}"` : ''}`}
            </div>
            <div className="text-xs text-destructive/80 mt-0.5">
              <span className="font-mono">{result.error}</span>
            </div>
          </div>
        </div>
     )
  }

  if (isUpdateProposal) {
    return (
      <div className="bg-background border rounded-xl w-full max-w-md flex flex-col items-start text-sm overflow-hidden">
        <div className="p-3 flex flex-row gap-3 items-start w-full border-b bg-muted/30">
          <div className="text-muted-foreground mt-0.5 flex-shrink-0">
            <PencilEditIcon size={16}/>
          </div>
          <div className="text-left flex-grow text-foreground">
            {`${getActionText(type, 'past')} "${result.title ?? 'document'}"`}
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

  const successMessage = 
    type === 'create' 
      ? (result.content || 'Document initialized successfully.') 
      : type === 'stream' 
        ? (result.content || 'Content generation completed.') 
        : 'Operation successful.';

  const SuccessIcon = CheckCircleFillIcon;

  return (
    <div className="bg-background border rounded-xl w-full max-w-md flex flex-row items-center text-sm overflow-hidden p-3 gap-3">
       <div className="text-green-600 flex-shrink-0">
         <SuccessIcon size={16}/>
       </div>
       <div className="flex-grow">
         <div className="text-foreground">
           {`${getActionText(type, 'past')} ${result.title ? `"${result.title}"` : '(active document)'}`}
         </div>
         <div className="text-xs text-muted-foreground mt-0.5">
           {successMessage}
         </div>
       </div>
    </div>
  );
}

export const DocumentToolResult = memo(PureDocumentToolResult);

interface DocumentToolCallProps {
  type: 'create' | 'stream' | 'update' | 'request-suggestions';
  args: { title?: string };
  isReadonly: boolean;
}

function PureDocumentToolCall({
  type,
  args = { title: '' },
  isReadonly,
}: DocumentToolCallProps) {
  const { artifact: localArtifact } = useArtifact();
  const artTitle = localArtifact?.title ?? '';

  const titleArg = args.title ?? '';
  const displayTitle = type === 'create' && artTitle.trim()
    ? artTitle
    : titleArg.trim();

  const CallIcon = 
    type === 'create' ? FileIcon :
    type === 'stream' ? MessageIcon :
    type === 'update' ? PencilEditIcon :
    type === 'request-suggestions' ? MessageIcon :
    LoaderIcon;

  return (
    <div
      className="bg-background border rounded-xl w-full max-w-md flex flex-row items-center justify-between gap-3 text-sm overflow-hidden"
    >
      <div className="p-3 flex flex-row gap-3 items-center w-full bg-muted/30">
        <div className="text-muted-foreground flex-shrink-0">
          <CallIcon size={16}/>
        </div>
        <div className="text-left flex-grow text-foreground">
          {`${getActionText(type, 'present')}`}{' '}
          {displayTitle ? `"${displayTitle}"` : '(active document)'}
        </div>
        <div className="animate-spin text-muted-foreground flex-shrink-0">
            <LoaderIcon size={16} />
        </div>
      </div>
    </div>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall);
