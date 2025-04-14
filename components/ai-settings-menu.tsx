'use client';

import { Settings, MessageCircle, BookText, Mail, Code, FileText, BriefcaseBusiness, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAiOptions, SuggestionLength } from '@/hooks/ai-options';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AiSettingsMenu() {
  const {
    suggestionLength,
    customInstructions,
    setSuggestionLength,
    setCustomInstructions,
  } = useAiOptions();

  // Local state to prevent Textarea lag
  const [localInstructions, setLocalInstructions] = useState(customInstructions);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // Update local state if global state changes externally
  useEffect(() => {
    setLocalInstructions(customInstructions);
  }, [customInstructions]);

  // Debounce saving custom instructions
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localInstructions !== customInstructions) {
        setCustomInstructions(localInstructions);
      }
    }, 500); // Save after 500ms of inactivity

    return () => {
      clearTimeout(handler);
    };
  }, [localInstructions, customInstructions, setCustomInstructions]);

  // Preset writing styles
  const presets = [
    { 
      id: 'professional', 
      label: 'Professional',
      description: 'Clear, concise business writing',
      icon: <BriefcaseBusiness className="size-3" />,
      instructions: 'Write in a professional, business tone. Use clear, concise language and maintain a formal style. Avoid jargon and focus on factual information.'
    },
    { 
      id: 'academic', 
      label: 'Academic', 
      description: 'Scholarly, citation-ready content',
      icon: <BookText className="size-3" />,
      instructions: 'Write in an academic style suitable for scholarly work. Use precise language, maintain a formal tone, include relevant terminology, and structure content logically with clear arguments.'
    },
    { 
      id: 'email', 
      label: 'Email', 
      description: 'Concise professional emails',
      icon: <Mail className="size-3" />,
      instructions: 'Format as a professional email with appropriate greeting and closing. Be concise and direct, with clear action items if needed. Maintain a polite, professional tone.'
    },
    { 
      id: 'technical', 
      label: 'Technical', 
      description: 'Technical documentation style',
      icon: <Code className="size-3" />,
      instructions: 'Write technical content with precise terminology. Structure with clear headings, use examples where appropriate, and prioritize accuracy and clarity over style.'
    },
    { 
      id: 'creative', 
      label: 'Creative', 
      description: 'Engaging narrative style',
      icon: <Brain className="size-3" />,
      instructions: 'Write with creative flair using descriptive language, engaging narrative techniques, and a conversational tone. Feel free to use metaphors and varied sentence structures.'
    },
    { 
      id: 'documentation', 
      label: 'Documentation', 
      description: 'Clear instructional content',
      icon: <FileText className="size-3" />,
      instructions: 'Write clear documentation with step-by-step instructions. Use numbered lists for sequences, bullet points for options, and include examples. Focus on clarity and completeness.'
    }
  ];

  const applyPreset = (instructions: string) => {
    setLocalInstructions(instructions);
    setCustomInstructions(instructions);
    setInstructionsOpen(true);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="h-fit p-2 dark:hover:bg-zinc-700"
            >
              <Settings className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-80 p-0 shadow-md rounded-lg border dark:border-zinc-700 bg-background" 
            align="end"
            sideOffset={8}
          >
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="text-sm font-medium">AI Preferences</span>
              {customInstructions && (
                <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-sm">
                  Custom Style Active
                </span>
              )}
            </div>

            {/* Writing Style Presets */}
            <div className="p-3 border-b space-y-2">
              <Label className="text-xs font-medium block mb-2">
                Writing Style Presets
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {presets.map(preset => (
                  <Button 
                    key={preset.id}
                    variant="outline"
                    size="sm"
                    className="h-auto py-2 px-2 flex flex-col items-center justify-start gap-1 text-xs"
                    onClick={() => applyPreset(preset.instructions)}
                  >
                    {preset.icon}
                    <span>{preset.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Suggestion Length */}
            <div className="p-3 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">
                    Suggestion Length
                  </Label>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {suggestionLength}
                  </span>
                </div>
                
                <RadioGroup
                  value={suggestionLength}
                  onValueChange={(value) => setSuggestionLength(value as SuggestionLength)}
                  className="grid grid-cols-3 gap-1"
                >
                  <div className="col-span-1">
                    <RadioGroupItem 
                      value="short" 
                      id="len-short" 
                      className="peer sr-only" 
                    />
                    <Label 
                      htmlFor="len-short" 
                      className={cn(
                        "flex flex-col items-center justify-center h-12 rounded-md border border-muted p-1 hover:border-ring/50 peer-data-[state=checked]:border-ring peer-data-[state=checked]:bg-accent/50 transition-all cursor-pointer select-none",
                      )}
                    >
                      <span className="text-sm font-medium">Short</span>
                      <span className="text-xs text-muted-foreground">1-5 words</span>
                    </Label>
                  </div>
                  
                  <div className="col-span-1">
                    <RadioGroupItem 
                      value="medium" 
                      id="len-medium" 
                      className="peer sr-only" 
                    />
                    <Label 
                      htmlFor="len-medium" 
                      className={cn(
                        "flex flex-col items-center justify-center h-12 rounded-md border border-muted p-1 hover:border-ring/50 peer-data-[state=checked]:border-ring peer-data-[state=checked]:bg-accent/50 transition-all cursor-pointer select-none",
                      )}
                    >
                      <span className="text-sm font-medium">Medium</span>
                      <span className="text-xs text-muted-foreground">5-10 words</span>
                    </Label>
                  </div>
                  
                  <div className="col-span-1">
                    <RadioGroupItem 
                      value="long" 
                      id="len-long" 
                      className="peer sr-only" 
                    />
                    <Label 
                      htmlFor="len-long" 
                      className={cn(
                        "flex flex-col items-center justify-center h-12 rounded-md border border-muted p-1 hover:border-ring/50 peer-data-[state=checked]:border-ring peer-data-[state=checked]:bg-accent/50 transition-all cursor-pointer select-none",
                      )}
                    >
                      <span className="text-sm font-medium">Long</span>
                      <span className="text-xs text-muted-foreground">10-15 words</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              
              {/* Custom Instructions Toggle */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setInstructionsOpen(!instructionsOpen)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  >
                    <MessageCircle className="size-3" />
                    Custom Instructions
                  </button>
                  
                  <button
                    onClick={() => setInstructionsOpen(!instructionsOpen)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {instructionsOpen ? "Hide" : "Show"}
                  </button>
                </div>
                
                {instructionsOpen && (
                  <div className="space-y-2">
                    <Textarea
                      id="custom-instructions"
                      placeholder="e.g., Write in a formal tone, Focus on technical accuracy..."
                      className="h-20 text-sm resize-none bg-muted/20 border-input focus-visible:ring-1 focus-visible:ring-ring"
                      value={localInstructions}
                      onChange={(e) => setLocalInstructions(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Applied to all AI-generated content
                    </p>
                  </div>
                )}
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent side="bottom">AI Settings</TooltipContent>
    </Tooltip>
  );
} 