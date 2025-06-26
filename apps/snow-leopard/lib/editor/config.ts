import { textblockTypeInputRule } from 'prosemirror-inputrules';
import { Schema } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { MutableRefObject } from 'react';
import OrderedMap from 'orderedmap';
import { DiffType } from './diff';

import { buildContentFromDocument } from './functions';

const diffMarkSpec = {
  attrs: { type: { default: '' } },
  toDOM(mark: any) {
    let className = '';
    switch (mark.attrs.type) {
      case DiffType.Inserted:
        className =
          'bg-green-100 text-green-700 dark:bg-green-500/70 dark:text-green-300';
        break;
      case DiffType.Deleted:
        className =
          'bg-red-100 line-through text-red-600 dark:bg-red-500/70 dark:text-red-300';
        break;
      default:
        className = '';
    }
    return ['span', { class: className, 'data-diff': mark.attrs.type }, 0];
  },
};

export const documentSchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: OrderedMap.from({
    ...schema.spec.marks.toObject(),
    diffMark: diffMarkSpec as any,
  }),
});

export function headingRule(level: number) {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${level}})\\s$`),
    documentSchema.nodes.heading,
    () => ({ level }),
  );
}

export const handleTransaction = ({
  transaction,
  editorRef,
  onSaveContent,
}: {
  transaction: Transaction;
  editorRef: MutableRefObject<EditorView | null>;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
}) => {
  if (!editorRef || !editorRef.current) return;

  const newState = editorRef.current.state.apply(transaction);
  editorRef.current.updateState(newState);

  if (transaction.docChanged && !transaction.getMeta('no-save')) {
    const updatedContent = buildContentFromDocument(newState.doc);

    if (transaction.getMeta('no-debounce')) {
      onSaveContent(updatedContent, false);
    } else {
      onSaveContent(updatedContent, true);
    }
  }
};
