'use client';

import React from 'react';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { Heading1, Heading2, List, ListOrdered, Pilcrow, Bold, Italic } from 'lucide-react';

import { documentSchema } from '@/lib/editor/config';
import { getActiveEditorView } from '@/lib/editor/editor-state';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const { nodes, marks } = documentSchema;

function runCommand(command: (state: any, dispatch?: any) => boolean) {
  const view = getActiveEditorView();
  if (!view) return;
  command(view.state, view.dispatch);
  view.focus();
}

interface EditorToolbarProps {
  activeFormats: Record<string, boolean>;
}

export function EditorToolbar({ activeFormats }: EditorToolbarProps) {
  const buttonClass = (format: string) =>
    cn(
      'h-8 w-8 p-0',
      activeFormats[format] && 'bg-muted text-foreground'
    );

  return (
    <div className="sticky top-0 z-10 flex h-10 items-center gap-1 border-b bg-background px-3 backdrop-blur-sm">
      <Button
        variant="ghost"
        className={buttonClass('h1')}
        onClick={() => runCommand(setBlockType(nodes.heading, { level: 1 }))}
        title="Heading 1"
      >
        <Heading1 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        className={buttonClass('h2')}
        onClick={() => runCommand(setBlockType(nodes.heading, { level: 2 }))}
        title="Heading 2"
      >
        <Heading2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        className={buttonClass('p')}
        onClick={() => runCommand(setBlockType(nodes.paragraph))}
        title="Paragraph"
      >
        <Pilcrow className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        className={buttonClass('bulletList')}
        onClick={() => runCommand(wrapInList(nodes.bullet_list))}
        title="Bullet List"
      >
        <List className="size-4" />
      </Button>
      <Button
        variant="ghost"
        className={buttonClass('orderedList')}
        onClick={() => runCommand(wrapInList(nodes.ordered_list))}
        title="Ordered List"
      >
        <ListOrdered className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        className={buttonClass('bold')}
        onClick={() => runCommand(toggleMark(marks.strong))}
        title="Bold"
      >
        <Bold className="size-4" />
      </Button>
      <Button
        variant="ghost"
        className={buttonClass('italic')}
        onClick={() => runCommand(toggleMark(marks.em))}
        title="Italic"
      >
        <Italic className="size-4" />
      </Button>
    </div>
  );
} 