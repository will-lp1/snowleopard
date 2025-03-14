'use client';

import { useState, useEffect, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResizablePanelProps {
  children: ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
}

export function ResizablePanel({
  children,
  defaultSize = 400,
  minSize = 300,
  maxSize = 600,
  className,
}: ResizablePanelProps) {
  const [size, setSize] = useState(defaultSize);
  const [isResizing, setIsResizing] = useState(false);

  // Handle mouse down on resize handle
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      // Calculate the new width based on distance from right edge of window
      const newSize = window.innerWidth - e.clientX;
      
      // Apply constraints
      const constrainedSize = Math.max(minSize, Math.min(maxSize, newSize));
      setSize(constrainedSize);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minSize, maxSize]);

  return (
    <div className="flex flex-row h-full">
      {/* Resize handle */}
      <div 
        className={cn(
          "w-1 cursor-col-resize flex flex-col items-center justify-center hover:bg-primary/10 group",
          isResizing && "bg-primary/20"
        )}
        onMouseDown={startResizing}
      >
        <div className="h-8 w-4 flex items-center justify-center rounded-sm">
          <GripVertical 
            className={cn(
              "h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60",
              isResizing && "text-primary/70"
            )} 
          />
        </div>
      </div>
      
      {/* Content panel */}
      <div 
        className={cn("h-full flex-shrink-0", className)}
        style={{ width: `${size}px` }}
      >
        {children}
      </div>
    </div>
  );
} 