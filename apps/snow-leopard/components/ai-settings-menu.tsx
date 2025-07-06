"use client";

import { Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAiOptions,
  useAiOptionsValue,
  SuggestionLength,
} from "@/hooks/ai-options";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function AiSettingsMenu() {
  const { suggestionLength, customInstructions, writingSample, writingStyleSummary, applyStyle } = useAiOptionsValue();
  const {
    setSuggestionLength,
    setCustomInstructions,
    setWritingSample,
    setWritingStyleSummary,
    setApplyStyle,
  } = useAiOptions();

  const [localWritingSample, setLocalWritingSample] = useState("");
  const [isEditingSample, setIsEditingSample] = useState(!writingStyleSummary);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Whenever store updates externally, sync local states
  useEffect(() => {
    if (!writingStyleSummary) {
      setIsEditingSample(true);
    } else {
      setIsEditingSample(false);
    }
  }, [writingStyleSummary]);

  const handleGenerateSummary = async () => {
    if (!localWritingSample || localWritingSample.trim().length < 200) {
      setGenerationError("Please provide at least ~200 characters of sample text.");
      return;
    }

    setIsGeneratingSummary(true);
    setGenerationError(null);

    try {
      const res = await fetch("/api/user-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleText: localWritingSample }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to generate style summary");
      }

      const { summary } = await res.json();

      // Persist to store
      setWritingSample(localWritingSample);
      setWritingStyleSummary(summary);

      setIsEditingSample(false);
      // No longer injecting into customInstructions; backend will add style summary automatically.
    } catch (err: any) {
      console.error("Style summary generation failed", err);
      setGenerationError(err.message || "Unknown error");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleClearProfile = () => {
    setWritingSample("");
    setWritingStyleSummary("");
    setLocalWritingSample("");
    setIsEditingSample(true);
  };

  const startRetrain = () => {
    setLocalWritingSample("");
    setIsEditingSample(true);
  };

  const toggleApplyStyle = (val: boolean) => {
    setApplyStyle(val);
  };

  return (
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
            <div className="mb-4">
              <span className="text-sm font-semibold text-foreground">AI Preferences</span>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Suggestion Length</Label>
              <div className="flex items-center gap-1.5">
                {(["short", "medium", "long"] as SuggestionLength[]).map(
                  (len) => (
                    <Button
                      key={len}
                      variant={suggestionLength === len ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "flex-1 h-8 text-xs capitalize",
                        suggestionLength === len
                          ? "font-semibold"
                          : "text-muted-foreground"
                      )}
                      onClick={() => setSuggestionLength(len)}
                    >
                      {len}
                    </Button>
                  )
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="custom-instructions"
                className="text-xs font-medium"
              >
                Custom Instructions
              </Label>
              <Textarea
                id="custom-instructions"
                placeholder="Guide the AI... e.g., 'Be concise', 'Act like a helpful expert', 'Translate to French'"
                className="h-24 text-sm resize-none bg-background border focus-visible:ring-1 focus-visible:ring-ring"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground leading-tight">
                Your instructions guide the AI's tone and behavior.
              </p>
            </div>

            <Separator className="my-4" />

            {/* Writing Voice Section */}
            <div className="space-y-4">
              {isEditingSample ? (
                <div className="space-y-3">
                  <Label className="text-xs font-medium">Train Writing Voice</Label>
                  <Textarea
                    placeholder="Paste ~200 characters of your writing so the AI can learn your style. This sample stays on your device."
                    className="h-28 text-sm resize-none bg-background border focus-visible:ring-1 focus-visible:ring-ring"
                    value={localWritingSample}
                    onChange={(e) => setLocalWritingSample(e.target.value)}
                  />

                  <Progress value={Math.min(100, (localWritingSample.length / 200) * 100)} className="h-1.5" />

                  {generationError && (
                    <p className="text-[11px] text-destructive leading-tight">{generationError}</p>
                  )}

                  <Button
                    size="sm"
                    className="w-full"
                    variant='outline'
                    disabled={isGeneratingSummary || localWritingSample.length < 200}
                    onClick={handleGenerateSummary}
                  >
                    {isGeneratingSummary && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    {isGeneratingSummary ? "Analyzing..." : "Create Voice Profile"}
                  </Button>
                </div>
              ) : (
                // Trained State
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="apply-style" className="text-xs font-medium">
                      Apply Writing Voice
                    </Label>
                    <Switch
                      id="apply-style"
                      checked={applyStyle}
                      onCheckedChange={toggleApplyStyle}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={startRetrain}
                    >
                      Retrain
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={handleClearProfile}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent side="bottom">AI Settings</TooltipContent>
    </Tooltip>
  );
}
