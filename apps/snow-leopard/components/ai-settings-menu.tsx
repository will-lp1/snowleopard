'use client';

import { Settings, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAiOptions, SuggestionLength } from '@/hooks/ai-options';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MCPServerManager } from '@/components/mcp/mcp-server-manager';

export function AiSettingsMenu() {
  const {
    suggestionLength,
    customInstructions,
    setSuggestionLength,
    setCustomInstructions,
  } = useAiOptions();

  const [localInstructions, setLocalInstructions] = useState(customInstructions);
  const [isMcpManagerOpen, setIsMcpManagerOpen] = useState(false);

  useEffect(() => {
    setLocalInstructions(customInstructions);
  }, [customInstructions]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localInstructions !== customInstructions) {
        setCustomInstructions(localInstructions);
      }
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [localInstructions, customInstructions, setCustomInstructions]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="h-8 w-8 p-0 flex items-center justify-center border rounded-md hover:bg-muted"
              >
                <Settings className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              className="w-64 p-3 shadow-lg rounded-lg border bg-popover" 
              align="end"
              sideOffset={6}
            >
              <DropdownMenuLabel className="px-1 text-sm font-medium">AI Preferences</DropdownMenuLabel>

              <div className="px-1 mb-3 mt-2 space-y-2">
                <Label className="text-xs font-medium block">
                  Suggestion Length
                </Label>
                <div className="flex items-center gap-1.5">
                  {(['short', 'medium', 'long'] as SuggestionLength[]).map((len) => (
                    <Button
                      key={len}
                      variant={suggestionLength === len ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        "flex-1 h-8 text-xs capitalize",
                        suggestionLength === len ? "font-semibold" : "text-muted-foreground"
                      )}
                      onClick={() => setSuggestionLength(len)}
                    >
                      {len}
                    </Button>
                  ))}
                </div>
              </div>
                  
              <DropdownMenuSeparator className="my-2 mx-[-4px]" />

              <div className="px-1 mb-3">
                <Button 
                  variant="outline"
                  className="w-full justify-start h-8 text-xs font-medium"
                  onClick={() => setIsMcpManagerOpen(true)}
                >
                  <Server size={14} className="mr-2 text-muted-foreground" />
                  Manage MCP Servers
                </Button>
              </div>
                  
              <DropdownMenuSeparator className="my-2 mx-[-4px]" />
                
              <div className="px-1 space-y-2">
                <Label htmlFor="custom-instructions" className="text-xs font-medium">
                  Custom Instructions
                </Label>
                <Textarea
                  id="custom-instructions"
                  placeholder="Guide the AI... e.g., 'Be concise', 'Act like a helpful expert', 'Translate to French'"
                  className="h-24 text-sm resize-none bg-background border focus-visible:ring-1 focus-visible:ring-ring"
                  value={localInstructions}
                  onChange={(e) => setLocalInstructions(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-tight px-0.5">
                  Leave blank for default behavior. Your instructions shape the AI&apos;s responses.
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipTrigger>
        <TooltipContent side="bottom">AI Settings</TooltipContent>
      </Tooltip>
      <MCPServerManager 
        open={isMcpManagerOpen} 
        onOpenChange={setIsMcpManagerOpen}
      />
    </>
  );
} 