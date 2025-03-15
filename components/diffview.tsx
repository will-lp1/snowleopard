import OrderedMap from 'orderedmap';
import {
  Schema,
  type Node as ProsemirrorNode,
  type MarkSpec,
  DOMParser,
} from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { useEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

import { diffEditor, DiffType } from '@/lib/editor/diff';

const diffSchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: OrderedMap.from({
    ...schema.spec.marks.toObject(),
    diffMark: {
      attrs: { type: { default: '' } },
      toDOM(mark) {
        let className = '';

        switch (mark.attrs.type) {
          case DiffType.Inserted:
            className =
              'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-1 py-0.5 rounded-sm border-l-2 border-green-500';
            break;
          case DiffType.Deleted:
            className =
              'bg-red-100 line-through text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1 py-0.5 rounded-sm border-l-2 border-red-500';
            break;
          default:
            className = '';
        }
        return ['span', { class: className }, 0];
      },
    } as MarkSpec,
  }),
});

function computeDiff(oldDoc: ProsemirrorNode, newDoc: ProsemirrorNode) {
  return diffEditor(diffSchema, oldDoc.toJSON(), newDoc.toJSON());
}

type DiffEditorProps = {
  oldContent: string;
  newContent: string;
};

export const DiffView = ({ oldContent, newContent }: DiffEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const parser = DOMParser.fromSchema(diffSchema);

      const oldHtmlContent = renderToString(
        <ReactMarkdown>{oldContent}</ReactMarkdown>,
      );
      const newHtmlContent = renderToString(
        <ReactMarkdown>{newContent}</ReactMarkdown>,
      );

      const oldContainer = document.createElement('div');
      oldContainer.innerHTML = oldHtmlContent;

      const newContainer = document.createElement('div');
      newContainer.innerHTML = newHtmlContent;

      const oldDoc = parser.parse(oldContainer);
      const newDoc = parser.parse(newContainer);

      const diffedDoc = computeDiff(oldDoc, newDoc);

      const state = EditorState.create({
        doc: diffedDoc,
        plugins: [],
      });

      viewRef.current = new EditorView(editorRef.current, {
        state,
        editable: () => false,
      });
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [oldContent, newContent]);

  return (
    <div className="diff-container p-4 bg-white dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-red-500/20 border border-red-500 rounded-sm"></span>
          <span>Removed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 bg-green-500/20 border border-green-500 rounded-sm"></span>
          <span>Added</span>
        </div>
      </div>
      <div className="diff-editor prose dark:prose-invert max-w-none" ref={editorRef} />
    </div>
  );
};
