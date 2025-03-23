'use client';

import { defaultMarkdownSerializer } from 'prosemirror-markdown';
import { DOMParser, type Node } from 'prosemirror-model';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { renderToString } from 'react-dom/server';

import { Markdown } from '@/components/markdown';

import { documentSchema } from './config';
import { createSuggestionWidget, type UISuggestion } from './suggestions';

export const buildDocumentFromContent = (content: string) => {
  const parser = DOMParser.fromSchema(documentSchema);
  const stringFromMarkdown = renderToString(<Markdown>{content}</Markdown>);
  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = stringFromMarkdown;
  return parser.parse(tempContainer);
};

export const buildContentFromDocument = (doc: Node) => {
  return defaultMarkdownSerializer.serialize(doc);

  
};

export const createDecorations = (
  suggestions: Array<UISuggestion>,
  view: EditorView,
  onReject?: (suggestion: UISuggestion) => void
) => {
  const decorations: Array<Decoration> = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: 'suggestion-highlight',
        },
        {
          suggestionId: suggestion.id,
          type: 'highlight',
        },
      ),
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (view) => {
          const { dom } = createSuggestionWidget(suggestion, view, onReject);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: 'widget',
        },
      ),
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};

// Find the position of text in a document
export function findTextPosition(doc: Node, searchText: string, startPos: number = 0): number {
  let pos = startPos;
  let found = false;
  
  doc.nodesBetween(startPos, doc.content.size, (node, nodePos) => {
    if (found) return false;
    if (node.isText && node.text?.includes(searchText)) {
      pos = nodePos + node.text.indexOf(searchText);
      found = true;
      return false;
    }
    return true;
  });
  
  return found ? pos : -1;
}

// Get text content between two positions
export function getTextBetween(doc: Node, from: number, to: number): string {
  let text = '';
  doc.nodesBetween(from, to, node => {
    if (node.isText) {
      text += node.text;
    }
    return true;
  });
  return text;
}

// New utility function to create diff decorations with accurate positions
export const createDiffDecorations = (
  doc: Node,
  oldContent: string,
  newContent: string,
  view: EditorView
) => {
  const decorations: Array<Decoration> = [];
  
  // Split content into lines for more granular diffing
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  let pos = 0;
  let lastMatchPos = 0;
  
  // Process each line to find changes
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : '';
    const newLine = i < newLines.length ? newLines[i] : '';
    
    if (oldLine !== newLine) {
      // Find the actual position in the document where this line starts
      const lineStart = findTextPosition(doc, newLine, lastMatchPos);
      
      if (lineStart !== -1) {
        const lineEnd = lineStart + newLine.length;
        lastMatchPos = lineEnd;
        
        if (newLine) {
          // Added or modified content
          decorations.push(
            Decoration.inline(lineStart, lineEnd, {
              class: 'diff-add',
              style: 'background-color: rgba(74, 222, 128, 0.2); transition: background-color 0.3s ease;'
            })
          );
        }
        
        if (oldLine) {
          // Find position of removed content
          const removedStart = findTextPosition(doc, oldLine, pos);
          if (removedStart !== -1) {
            decorations.push(
              Decoration.inline(removedStart, removedStart + oldLine.length, {
                class: 'diff-remove',
                style: 'background-color: rgba(248, 113, 113, 0.2); text-decoration: line-through; transition: all 0.3s ease;'
              })
            );
          }
        }
      }
    } else {
      // Line matches, update position counter
      lastMatchPos = findTextPosition(doc, newLine, lastMatchPos);
      if (lastMatchPos !== -1) {
        lastMatchPos += newLine.length;
      }
    }
  }
  
  return DecorationSet.create(doc, decorations);
};

// Improved streaming decorations function
export const createStreamingDecorations = (
  doc: Node,
  streamedContent: string,
  view: EditorView
) => {
  const decorations: Array<Decoration> = [];
  
  // Find the exact position of the streamed content
  const streamStart = findTextPosition(doc, streamedContent);
  
  if (streamStart !== -1) {
    decorations.push(
      Decoration.inline(streamStart, streamStart + streamedContent.length, {
        class: 'streaming-content',
        style: 'background-color: rgba(74, 222, 128, 0.1); transition: background-color 0.3s ease;'
      })
    );
  }
  
  return DecorationSet.create(doc, decorations);
};
