'use client';

import {
  $isCodeNode,
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CODE_LANGUAGE_MAP,
  getLanguageFriendlyName,
} from '@lexical/code';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $isHeadingNode,
  HeadingTagType,
} from '@lexical/rich-text';
import { $getSelectionStyleValueForProperty, $setBlocksType } from '@lexical/selection';
import { $findMatchingParent, $getNearestNodeOfType, mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  LexicalEditor,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  forwardRef,
} from 'react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Pilcrow,
  Redo,
  Underline,
  Undo,
} from 'lucide-react';

// Block type definitions
const blockTypeToBlockName = {
  paragraph: 'Normal',
  bullet: 'Bullet List',
  number: 'Numbered List',
  check: 'Check List',
};

type BlockType = keyof typeof blockTypeToBlockName;

// Formatting function for block types
function formatBlock(
  editor: LexicalEditor,
  blockType: BlockType,
  currentBlockType: BlockType,
) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    if (blockType === 'paragraph') {
      $setBlocksType(selection as any, () => $createParagraphNode() as any);
    } else if (blockType === 'bullet') {
      // List commands are handled outside the update block
    } else if (blockType === 'number') {
      // List commands are handled outside the update block
    } else if (blockType === 'check') {
      // List commands are handled outside the update block
    }
  });

  // Handle list commands outside the update block as they dispatch commands
  if (blockType === 'bullet') {
    if (currentBlockType !== 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  } else if (blockType === 'number') {
    if (currentBlockType !== 'number') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  } else if (blockType === 'check') {
    if (currentBlockType !== 'check') {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  }
}

interface ToolbarState {
  canUndo: boolean;
  canRedo: boolean;
  blockType: BlockType;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  isCode: boolean;
  elementFormat: ElementFormatType;
}

const initialToolbarState: ToolbarState = {
  canUndo: false,
  canRedo: false,
  blockType: 'paragraph',
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isCode: false,
  elementFormat: 'left',
};

// Mapping BlockType to Icons
const BlockTypeIcon: Record<BlockType, React.ElementType> = {
  paragraph: Pilcrow,
  bullet: List,
  number: ListOrdered,
  check: Check,
};

const EditorToolbar = forwardRef<HTMLDivElement>((props, ref) => {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);
  const [toolbarState, setToolbarState] =
    useState<ToolbarState>(initialToolbarState);

  const {
    canUndo,
    canRedo,
    blockType,
    isBold,
    isItalic,
    isUnderline,
    isCode,
    elementFormat,
  } = toolbarState;

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    const newState: Partial<ToolbarState> = {};

    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow();
      }

      // Update block type
      if ($isListNode(element)) {
        const parentList = $getNearestNodeOfType<ListNode>(
          anchorNode,
          ListNode,
        );
        const type = parentList ? parentList.getListType() : element.getListType();
        newState.blockType = type;
      } else {
        const type = $isHeadingNode(element)
          ? element.getTag()
          : element.getType();
        if (type in blockTypeToBlockName) {
          newState.blockType = type as BlockType;
        } else {
          newState.blockType = 'paragraph'; // Default if unknown
        }
        // Note: Code block specifics like language are not handled here yet
      }

      // Update text formats
      newState.isBold = selection.hasFormat('bold');
      newState.isItalic = selection.hasFormat('italic');
      newState.isUnderline = selection.hasFormat('underline');
      newState.isCode = selection.hasFormat('code');

      // Update element format (alignment)
      const node = selection.anchor.getNode();
      const parent = node.getParent();
      let format: ElementFormatType = 'left'; // Default
      if (element && typeof (element as any).getFormatType === 'function') {
          format = (element as any).getFormatType() || 'left';
      } else if (parent && typeof (parent as any).getFormatType === 'function') {
          format = (parent as any).getFormatType() || 'left';
      }
      newState.elementFormat = format;

    }

    setToolbarState((prevState) => ({ ...prevState, ...newState }));
  }, [activeEditor]); // Include activeEditor dependency

  useEffect(() => {
    // Listen for selection changes
    const unregisterSelectionChange = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, newEditor) => {
        setActiveEditor(newEditor); // Update active editor
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    // Listen for editor updates
    const unregisterUpdate = activeEditor.registerUpdateListener(
      ({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      },
    );

    // Listen for undo/redo state changes
    const unregisterCanUndo = activeEditor.registerCommand<boolean>(
      CAN_UNDO_COMMAND,
      (payload) => {
        setToolbarState((s) => ({ ...s, canUndo: payload }));
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    const unregisterCanRedo = activeEditor.registerCommand<boolean>(
      CAN_REDO_COMMAND,
      (payload) => {
        setToolbarState((s) => ({ ...s, canRedo: payload }));
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );

    // Initial toolbar update
    activeEditor.getEditorState().read(() => {
      updateToolbar();
    });

    // Cleanup
    return () => {
      unregisterSelectionChange();
      unregisterUpdate();
      unregisterCanUndo();
      unregisterCanRedo();
    };
  }, [editor, activeEditor, updateToolbar]); // Ensure all dependencies are listed

  const handleFormatText = (format: 'bold' | 'italic' | 'underline' | 'code') => {
    activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const handleFormatElement = (format: ElementFormatType) => {
    activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
  };

  const handleBlockTypeChange = (newBlockType: BlockType) => {
    formatBlock(activeEditor, newBlockType, blockType);
  };

  return (
    <div
      ref={ref}
      className="flex flex-wrap items-center gap-1 p-2 rounded-t-md bg-background sticky top-0 z-10"
      {...props}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => activeEditor.dispatchCommand(UNDO_COMMAND, undefined)}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => activeEditor.dispatchCommand(REDO_COMMAND, undefined)}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (Ctrl+Y)"
      >
        <Redo className="h-4 w-4" />
      </Button>
      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Block Type Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="w-[130px] justify-start gap-1 px-2">
            {React.createElement(BlockTypeIcon[blockType] || Pilcrow, { className: "h-4 w-4" })}
            <span className="flex-1 text-left truncate">{blockTypeToBlockName[blockType]}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(Object.keys(blockTypeToBlockName) as BlockType[]).map((type) => (
            <DropdownMenuItem
              key={type}
              onClick={() => handleBlockTypeChange(type)}
              className={cn(
                'flex items-center gap-2',
                blockType === type && 'bg-accent'
              )}
            >
             {React.createElement(BlockTypeIcon[type] || Pilcrow, { className: "h-4 w-4" })}
              <span>{blockTypeToBlockName[type]}</span>
              {blockType === type && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text Formatting Toggles */}
      <Toggle
        size="sm"
        pressed={isBold}
        onPressedChange={() => handleFormatText('bold')}
        aria-label="Bold"
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={isItalic}
        onPressedChange={() => handleFormatText('italic')}
        aria-label="Italic"
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={isUnderline}
        onPressedChange={() => handleFormatText('underline')}
        aria-label="Underline"
        title="Underline (Ctrl+U)"
      >
        <Underline className="h-4 w-4" />
      </Toggle>
       <Toggle
        size="sm"
        pressed={isCode}
        onPressedChange={() => handleFormatText('code')}
        aria-label="Inline Code"
        title="Inline Code"
      >
        <Code className="h-4 w-4" />
      </Toggle>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment Toggles */}
       <Toggle
        size="sm"
        pressed={elementFormat === 'left'}
        onPressedChange={() => handleFormatElement('left')}
        aria-label="Align Left"
         title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </Toggle>
       <Toggle
        size="sm"
        pressed={elementFormat === 'center'}
        onPressedChange={() => handleFormatElement('center')}
        aria-label="Align Center"
         title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </Toggle>
       <Toggle
        size="sm"
        pressed={elementFormat === 'right'}
        onPressedChange={() => handleFormatElement('right')}
        aria-label="Align Right"
         title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </Toggle>
       <Toggle
        size="sm"
        pressed={elementFormat === 'justify'}
        onPressedChange={() => handleFormatElement('justify')}
        aria-label="Align Justify"
         title="Align Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </Toggle>

       <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Indentation Buttons */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => activeEditor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)}
        aria-label="Outdent"
        title="Outdent"
      >
        <Outdent className="h-4 w-4" />
      </Button>
       <Button
        variant="ghost"
        size="icon"
        onClick={() => activeEditor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)}
        aria-label="Indent"
        title="Indent"
      >
        <Indent className="h-4 w-4" />
      </Button>

      {/* Add more toolbar items here (e.g., font size, color, insert...) */}

    </div>
  );
});

EditorToolbar.displayName = 'EditorToolbar';

export default EditorToolbar; 