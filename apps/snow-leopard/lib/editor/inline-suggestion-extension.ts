import { Extension } from '@tiptap/core';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { inlineSuggestionPlugin } from './inline-suggestion-plugin';

export interface InlineSuggestionOptions {
  requestSuggestion: (state: EditorState, view: EditorView) => void;
}

export const InlineSuggestion = Extension.create<InlineSuggestionOptions>({
  name: 'inlineSuggestion',

  addOptions() {
    return {
      requestSuggestion: () => {},
    };
  },

  addProseMirrorPlugins() {
    return [
      inlineSuggestionPlugin({
        requestSuggestion: this.options.requestSuggestion,
      }),
    ];
  },
}); 