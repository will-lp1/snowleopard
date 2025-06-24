'use client';

import React from 'react';
import type { Editor } from '@tiptap/react';
import { Heading1, Heading2, List, ListOrdered, Pilcrow, Bold, Italic, ChevronsUpDown, Sigma, Minus } from 'lucide-react';
import { Toggle } from './ui/toggle';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  activeFormats: Record<string, boolean>;
  editor: Editor;
}

export const EditorToolbar = ({ activeFormats, editor }: EditorToolbarProps) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 mb-4 -mx-2 px-2 border-b border-border">
      <div className="border border-input dark:border-neutral-700 bg-transparent rounded-md p-1 flex items-center gap-1 w-fit mx-auto">
        <Toggle
          size="sm"
          pressed={activeFormats.h1}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className="h-8 w-8"
        >
          <Heading1 className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={activeFormats.h2}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className="h-8 w-8"
        >
          <Heading2 className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={activeFormats.p}
          onPressedChange={() => editor.chain().focus().setParagraph().run()}
          className="h-8 w-8"
        >
          <Pilcrow className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Toggle
          size="sm"
          pressed={activeFormats.bold}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          className="h-8 w-8"
        >
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={activeFormats.italic}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          className="h-8 w-8"
        >
          <Italic className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Toggle
          size="sm"
          pressed={activeFormats.bulletList}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          className="h-8 w-8"
        >
          <List className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={activeFormats.orderedList}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          className="h-8 w-8"
        >
          <ListOrdered className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Toggle
          size="sm"
          onPressedChange={() => editor.chain().focus().setHorizontalRule().run()}
          className="h-8 w-8"
        >
          <Minus className="h-4 w-4" />
        </Toggle>
      </div>
    </div>
  );
}; 