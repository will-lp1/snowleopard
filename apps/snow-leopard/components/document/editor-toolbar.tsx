'use client';

import React from 'react';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';
import {
  List,
  ListOrdered,
  Bold,
  Italic,
  Quote,
  Code,
} from 'lucide-react';

import { documentSchema } from '@/lib/editor/config';
import { getActiveEditorView } from '@/lib/editor/editor-state';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

import { wrapIn, lift } from 'prosemirror-commands';

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

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
      'h-8 w-8 p-0 rounded-md flex items-center justify-center transition-colors outline-none ring-0',
      'border border-border bg-background dark:hover:bg-zinc-700',
      activeFormats[format]
        ? 'bg-accent text-accent-foreground border-accent'
        : 'hover:bg-muted hover:text-foreground',
    );

  const currentTextStyle = activeFormats.h1
    ? 'Heading 1'
    : activeFormats.h2
    ? 'Heading 2'
    : 'Paragraph';

  const textOptions: {
    label: string;
    formatKey: keyof typeof activeFormats;
    command: () => void;
  }[] = [
    {
      label: 'Heading 1',
      formatKey: 'h1',
      command: () => runCommand(setBlockType(nodes.heading, { level: 1 })),
    },
    {
      label: 'Heading 2',
      formatKey: 'h2',
      command: () => runCommand(setBlockType(nodes.heading, { level: 2 })),
    },
    {
      label: 'Paragraph',
      formatKey: 'p',
      command: () => runCommand(setBlockType(nodes.paragraph)),
    },
  ];

  const ButtonWithTooltip = ({
    label,
    children,
    onClick,
    formatKey,
  }: {
    label: string;
    children: React.ReactNode;
    onClick: () => void;
    formatKey: string;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className={buttonClass(formatKey)}
          onClick={onClick}
          type="button"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex items-center gap-1">

      {/* Text style dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-8 px-2 min-w-[7rem] flex items-center justify-between gap-1">
            <span className="truncate text-sm font-medium">{currentTextStyle}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40 p-1 shadow-lg rounded-md border bg-popover" align="start">
          {textOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.label}
              onSelect={(e) => {
                e.preventDefault();
                opt.command();
              }}
              className={cn('text-sm', opt.formatKey && activeFormats[opt.formatKey] && 'bg-accent text-accent-foreground')}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-2 h-6" />

      <ButtonWithTooltip
        label="Bullet List"
        formatKey="bulletList"
        onClick={() =>
          activeFormats.bulletList
            ? runCommand(liftListItem(nodes.list_item))
            : runCommand(wrapInList(nodes.bullet_list))
        }
      >
        <List className="size-4" />
      </ButtonWithTooltip>
      <ButtonWithTooltip
        label="Numbered List"
        formatKey="orderedList"
        onClick={() =>
          activeFormats.orderedList
            ? runCommand(liftListItem(nodes.list_item))
            : runCommand(wrapInList(nodes.ordered_list))
        }
      >
        <ListOrdered className="size-4" />
      </ButtonWithTooltip>

      <Separator orientation="vertical" className="mx-2 h-6" />

      <ButtonWithTooltip
        label="Bold"
        formatKey="bold"
        onClick={() => runCommand(toggleMark(marks.strong))}
      >
        <Bold className="size-4" />
      </ButtonWithTooltip>
      <ButtonWithTooltip
        label="Italic"
        formatKey="italic"
        onClick={() => runCommand(toggleMark(marks.em))}
      >
        <Italic className="size-4" />
      </ButtonWithTooltip>

      <ButtonWithTooltip
        label="Inline Code"
        formatKey="code"
        onClick={() => runCommand(toggleMark(marks.code))}
      >
        <Code className="size-4" />
      </ButtonWithTooltip>

      <Separator orientation="vertical" className="mx-2 h-6" />

      <ButtonWithTooltip
        label="Block Quote"
        formatKey="blockquote"
        onClick={() =>
          activeFormats.blockquote
            ? runCommand(lift)
            : runCommand(wrapIn(nodes.blockquote))
        }
      >
        <Quote className="size-4" />
      </ButtonWithTooltip>

      <ButtonWithTooltip
        label="Code Block"
        formatKey="codeBlock"
        onClick={() =>
          activeFormats.codeBlock
            ? runCommand(setBlockType(nodes.paragraph))
            : runCommand(setBlockType(nodes.code_block))
        }
      >
        <Code className="size-4" />
      </ButtonWithTooltip>
    </div>
  );
}