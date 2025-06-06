"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatToggle } from "@/hooks/chat-toggle";

export function ToggleAiChat() {
    const { isOpen, setIsOpen } = useChatToggle();   

  return (
    <Tooltip>
      <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="h-8 w-8 p-0 flex items-center justify-center border rounded-md hover:bg-muted"
              onClick={() => {
                setIsOpen(!isOpen);
              } }
            >
              <PanelLeft className="size-4" />
            </Button>
          
      </TooltipTrigger>
      <TooltipContent side="bottom">Toggle Chat</TooltipContent>
    </Tooltip>
  );
}
