"use client";

import { Settings } from "lucide-react";
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
            <div className="mb-3">
              <span className="text-sm font-medium">AI Preferences</span>
            </div>

            <div className="mb-4 space-y-2">
              <Label className="text-xs font-medium block">
                Suggestion Length
              </Label>
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
                Leave blank for default behavior. Your instructions shape the
                AI&apos;s responses.
              </p>
            </div>

            {/* Writing Voice Section */}
            <div className="mt-6 space-y-2">
              <Label className="text-xs font-medium block">Writing Voice</Label>

              {isEditingSample ? (
                <>
                  <Textarea
                    placeholder="Paste about 200-400 words that *sound like you*. This stays on your device."
                    className="h-24 text-sm resize-none bg-background border focus-visible:ring-1 focus-visible:ring-ring"
                    value={localWritingSample}
                    onChange={(e) => setLocalWritingSample(e.target.value)}
                  />

                  {/* Character count & progress */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{localWritingSample.length} / 200</span>
                    <span>{localWritingSample.length < 200 ? "Need a bit more…" : "Good to go"}</span>
                  </div>

                  <Progress value={Math.min(100, (localWritingSample.length / 200) * 100)} className="h-1" />

                  {generationError && (
                    <p className="text-[11px] text-destructive leading-tight">{generationError}</p>
                  )}

                  <Button
                    size="sm"
                    className="w-full"
                    disabled={isGeneratingSummary || localWritingSample.length < 200}
                    onClick={handleGenerateSummary}
                  >
                    {isGeneratingSummary ? "Analysing…" : "Create Voice"}
                  </Button>
                </>
              ) : (
                <div className="border rounded-md p-3 bg-muted/25 space-y-2">
                  <p className="text-sm">Writing voice ready.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={startRetrain}>
                      Retrain
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleClearProfile}>
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
