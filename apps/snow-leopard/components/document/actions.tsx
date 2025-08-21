import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Copy as CopyIcon } from "lucide-react";
import { toast } from "sonner";

interface DocumentActionsProps {
  content: string;
  isSaving: boolean;
}

export function DocumentActions({ content, isSaving }: DocumentActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {isSaving && <span className="text-xs text-muted-foreground mr-2">Saving…</span>}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => {
              navigator.clipboard.writeText(content);
              toast.success("Copied to clipboard!");
            }}
          >
            <CopyIcon size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy to clipboard</TooltipContent>
      </Tooltip>
    </div>
  );
}