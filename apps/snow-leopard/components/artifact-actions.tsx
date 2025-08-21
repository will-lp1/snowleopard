import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { artifactDefinitions, UIArtifact } from './artifact';
import { Dispatch, memo, SetStateAction, useState } from 'react';
import { ArtifactActionContext } from './create-artifact';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Loader2, Copy as CopyIcon } from 'lucide-react';
import { useGT } from 'gt-next';

interface ArtifactActionsProps {
  artifact: UIArtifact;
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: 'edit' | 'diff';
  metadata: any;
  setMetadata: Dispatch<SetStateAction<any>>;
}

function PureArtifactActions({
  artifact,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  metadata,
  setMetadata,
}: ArtifactActionsProps) {
  const t = useGT();
  const [isLoading, setIsLoading] = useState(false);
  const isSaving = artifact.saveState === 'saving';

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind,
  );

  // Handle case when artifact definition is not found
  if (!artifactDefinition) {
    // Fallback actions for when definition is not found
    const fallbackActions = [
      {
        description: t('Copy to clipboard'),
        icon: <CopyIcon size={16} />,
        onClick: () => {
          navigator.clipboard.writeText(artifact.content);
          toast.success(t('Copied to clipboard!'));
        }
      }
    ];
    
    const actionContext: ArtifactActionContext = {
      content: artifact.content,
      handleVersionChange,
      currentVersionIndex,
      isCurrentVersion,
      mode,
      metadata,
      setMetadata,
    };
    
    return (
      <div className="flex flex-row gap-1 items-center">
        {/* Saving indicator */}
        {isCurrentVersion && isSaving && (
          <div className="mr-2 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" />
            <span>{t('Saving...')}</span>
          </div>
        )}
        
        {fallbackActions.map((action) => (
          <Tooltip key={action.description}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-fit dark:hover:bg-zinc-700 p-2"
                onClick={() => action.onClick()}
              >
                {action.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{action.description}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  const actionContext: ArtifactActionContext = {
    content: artifact.content,
    handleVersionChange,
    currentVersionIndex,
    isCurrentVersion,
    mode,
    metadata,
    setMetadata,
  };

  return (
    <div className="flex flex-row gap-1 items-center">
      {/* Saving indicator */}
      {isCurrentVersion && isSaving && (
        <div className="mr-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" />
          <span>{t('Saving...')}</span>
        </div>
      )}

      {artifactDefinition.actions
        .filter((action) => action.description !== 'View changes')
        .map((action) => (
        <Tooltip key={action.description}>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className={cn('h-8 flex items-center justify-center dark:hover:bg-zinc-700', {
                'w-8 p-0': !action.label,
                'w-auto px-2': action.label,
              })}
              onClick={async () => {
                setIsLoading(true);

                try {
                  await Promise.resolve(action.onClick(actionContext));
                } catch (error) {
                  toast.error(t('Failed to execute action'));
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={
                isLoading || artifact.status === 'streaming'
                  ? true
                  : action.isDisabled
                    ? action.isDisabled(actionContext)
                    : false
              }
            >
              {action.icon}
              {action.label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action.description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export const ArtifactActions = memo(
  PureArtifactActions,
  (prevProps, nextProps) => {
    if (prevProps.artifact.status !== nextProps.artifact.status) return false;
    if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex)
      return false;
    if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) return false;
    if (prevProps.artifact.content !== nextProps.artifact.content) return false;

    return true;
  },
);