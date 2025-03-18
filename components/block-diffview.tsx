import React, { useState, useCallback, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { DiffView } from './diffview';
import { cn } from '@/lib/utils';

interface TextBlock {
  oldText: string;
  newText: string;
  id: string;
}

interface BlockDiffViewProps {
  oldContent: string;
  newContent: string;
  onAcceptBlock: (blockId: string, newText: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

// Splits text into logical blocks based on empty lines (paragraphs)
const splitIntoBlocks = (oldContent: string, newContent: string): TextBlock[] => {
  // Simple paragraph-based splitting
  const oldBlocks = oldContent.split(/\n\s*\n/);
  const newBlocks = newContent.split(/\n\s*\n/);
  
  const blocks: TextBlock[] = [];
  
  // If the blocks have different lengths, we'll use the longer one as a base
  const maxLength = Math.max(oldBlocks.length, newBlocks.length);
  
  for (let i = 0; i < maxLength; i++) {
    const oldText = i < oldBlocks.length ? oldBlocks[i] : '';
    const newText = i < newBlocks.length ? newBlocks[i] : '';
    
    // Only create blocks for differences
    if (oldText !== newText) {
      blocks.push({
        oldText,
        newText,
        id: `block-${i}`
      });
    }
  }
  
  return blocks;
};

export function BlockDiffView({ 
  oldContent, 
  newContent, 
  onAcceptBlock,
  onAcceptAll,
  onRejectAll
}: BlockDiffViewProps) {
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [acceptedBlockIds, setAcceptedBlockIds] = useState<Set<string>>(new Set());
  const [showFullDiff, setShowFullDiff] = useState(false);
  
  // Initialize blocks when content changes
  useEffect(() => {
    const newBlocks = splitIntoBlocks(oldContent, newContent);
    setBlocks(newBlocks);
    setAcceptedBlockIds(new Set());
  }, [oldContent, newContent]);
  
  const handleAcceptBlock = useCallback((blockId: string, newText: string) => {
    onAcceptBlock(blockId, newText);
    setAcceptedBlockIds(prev => {
      const updated = new Set(prev);
      updated.add(blockId);
      return updated;
    });
  }, [onAcceptBlock]);
  
  const handleAcceptAll = useCallback(() => {
    onAcceptAll();
    // Mark all blocks as accepted
    setAcceptedBlockIds(new Set(blocks.map(block => block.id)));
  }, [blocks, onAcceptAll]);
  
  const areAllBlocksAccepted = blocks.length > 0 && 
    blocks.every(block => acceptedBlockIds.has(block.id));
    
  // If there are no blocks or all blocks are accepted, don't show anything
  if (blocks.length === 0 || areAllBlocksAccepted) {
    return null;
  }
  
  return (
    <div className="block-diff-container border rounded-md overflow-hidden">
      <div className="bg-primary/10 p-3 flex justify-between items-center">
        <h3 className="text-sm font-medium m-0">AI Updated Document</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFullDiff(prev => !prev)}
            className="text-xs px-3 py-1 rounded-md bg-muted hover:bg-muted/80"
          >
            {showFullDiff ? "Show Blocks" : "Show Full Diff"}
          </button>
          <button 
            onClick={handleAcceptAll}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md flex items-center gap-1"
          >
            <Check size={12} />
            <span>Accept All</span>
          </button>
          <button 
            onClick={onRejectAll}
            className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md flex items-center gap-1"
          >
            <X size={12} />
            <span>Reject All</span>
          </button>
        </div>
      </div>
      
      {showFullDiff ? (
        <div className="p-4 bg-muted/30">
          <DiffView oldContent={oldContent} newContent={newContent} />
        </div>
      ) : (
        <div className="p-0 bg-muted/30 divide-y">
          {blocks.map(block => (
            <div 
              key={block.id} 
              className={cn(
                "p-3 transition-colors", 
                acceptedBlockIds.has(block.id) ? "bg-green-50 dark:bg-green-950/20" : ""
              )}
            >
              <div className="mb-2">
                <DiffView oldContent={block.oldText} newContent={block.newText} />
              </div>
              {!acceptedBlockIds.has(block.id) && (
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => handleAcceptBlock(block.id, block.newText)}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded flex items-center gap-1"
                  >
                    <Check size={10} />
                    <span>Accept</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 