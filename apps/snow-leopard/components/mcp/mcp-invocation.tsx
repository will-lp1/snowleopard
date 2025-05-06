"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2,
  CheckCircle2,
  TerminalSquare,
  Code,
  ArrowRight,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface MCPInvocationProps {
  toolName: string;
  toolCallId: string;
  args: Record<string, any> | string;
  result?: any;
  error?: string | null;
  isRunning?: boolean;
  isCollapsedInitially?: boolean;
}

export function MCPInvocation({
  toolName,
  toolCallId,
  args,
  result,
  error,
  isRunning = false,
  isCollapsedInitially = true,
}: MCPInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(!isCollapsedInitially);

  const variants = {
    collapsed: { height: 0, opacity: 0, marginTop: 0, marginBottom: 0 },
    expanded: { height: "auto", opacity: 1, marginTop: '0.5rem', marginBottom: '0.5rem' },
  };

  let statusText = "Waiting";
  let StatusIcon = <Circle className="h-3.5 w-3.5 fill-muted-foreground/10 text-muted-foreground/70" />;
  let statusColorClass = "text-muted-foreground";
  let dataState = "waiting";

  if (error) {
    statusText = "Error";
    StatusIcon = <AlertTriangle size={14} className="text-destructive" />;
    statusColorClass = "text-destructive";
    dataState = "error";
  } else if (isRunning) {
    statusText = "Running";
    StatusIcon = <Loader2 className="animate-spin h-3.5 w-3.5 text-primary/70" />;
    statusColorClass = "text-primary";
    dataState = "running";
  } else if (result !== undefined) {
    statusText = "Completed";
    StatusIcon = <CheckCircle2 size={14} className="text-green-600" />;
    statusColorClass = "text-green-600";
    dataState = "completed";
  }

  const formatContent = (content: any): string => {
    if (typeof content === 'string') {
        try {
            if ((content.startsWith('{') && content.endsWith('}')) || (content.startsWith('[') && content.endsWith(']'))) {
                const parsed = JSON.parse(content);
                return JSON.stringify(parsed, null, 2);
            }
            return content;
        } catch {
            return content;
        }
    }
    try {
        return JSON.stringify(content, null, 2);
    } catch {
        return String(content);
    }
  };
  
  const parsedArgs = typeof args === 'string' ? formatContent(args) : args;

  return (
    <div className={cn(
      "flex flex-col mb-2 rounded-xl border overflow-hidden",
      "bg-background",
      "transition-all duration-200",
      {
        "border-destructive/60": dataState === "error",
        "border-primary/50": dataState === "running",
        "border-green-500/40": dataState === "completed",
        "border-border": dataState === "waiting",
      }
    )}
    >
      <div 
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors",
          "hover:bg-muted/30"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={cn(
            "flex items-center justify-center rounded-full w-5 h-5 text-white shrink-0",
            {
                "bg-destructive/80": dataState === "error",
                "bg-primary/70": dataState === "running",
                "bg-green-600/80": dataState === "completed",
                "bg-muted-foreground/60": dataState === "waiting",
            }
        )}>
          <TerminalSquare className="h-3 w-3" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground flex-1 min-w-0">
          <span className="text-foreground font-semibold tracking-tight truncate" title={toolName}>{toolName}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className={cn("font-medium whitespace-nowrap", statusColorClass)}>
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
          {StatusIcon}
          <Button variant="ghost" size="icon" className="h-6 w-6 bg-muted/20 hover:bg-muted/40 rounded-full p-0.5 border border-transparent">
            {isExpanded ? (
              <ChevronUpIcon className="h-3.5 w-3.5 text-foreground/70" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5 text-foreground/70" />
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key={`content-${toolCallId}`}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={variants}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="border-t border-border/40 bg-muted/10"
          >
            <div className="space-y-2 px-3 py-3 text-xs">
              {parsedArgs && (typeof parsedArgs !== 'object' || Object.keys(parsedArgs).length > 0) && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground/80">
                    <Code className="h-3.5 w-3.5" />
                    <span className="font-medium">Arguments:</span>
                  </div>
                  <pre className={cn(
                    "font-mono p-2 rounded-md overflow-x-auto text-[11px] leading-relaxed",
                    "border border-border/30 bg-background/50 max-h-[150px]"
                  )}>
                    {formatContent(parsedArgs)}
                  </pre>
                </div>
              )}
              
              {result !== undefined && !error && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground/80">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    <span className="font-medium">Result:</span>
                  </div>
                  <pre className={cn(
                    "font-mono p-2 rounded-md overflow-x-auto text-[11px] leading-relaxed",
                    "border border-border/30 bg-background/50 max-h-[200px]"
                  )}>
                    {formatContent(result)}
                  </pre>
                </div>
              )}
               {error && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="font-medium">Error:</span>
                  </div>
                  <pre className={cn(
                    "font-mono p-2 rounded-md overflow-x-auto text-[11px] leading-relaxed",
                    "border border-destructive/30 bg-destructive/10 text-destructive whitespace-pre-wrap max-h-[200px]"
                  )}>
                    {formatContent(error)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 