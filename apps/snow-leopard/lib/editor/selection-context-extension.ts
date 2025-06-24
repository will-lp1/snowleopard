import { Extension } from '@tiptap/core';
import { selectionContextPlugin } from './selection-context-plugin';

export const SelectionContext = Extension.create({
  name: 'selectionContext',

  addProseMirrorPlugins() {
    return [selectionContextPlugin()];
  },
}); 