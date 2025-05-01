import { Plugin, PluginKey } from 'prosemirror-state';
import { defaultMarkdownParser } from 'prosemirror-markdown';

export const creationStreamingKey = new PluginKey('creationStreaming');

/**
 * A ProseMirror plugin that listens for creation stream events and
 * inserts incoming Markdown chunks into the document as structured nodes.
 *
 * Usage:
 *   window.dispatchEvent(new CustomEvent('editor:stream-text', { detail: { documentId, content } }));
 */
export function creationStreamingPlugin(targetDocumentId: string) {
  return new Plugin({
    key: creationStreamingKey,
    view(editorView) {
      const handleStream = (event: CustomEvent) => {
        const { documentId, content } = event.detail;
        if (documentId !== targetDocumentId) return;
        try {
          // parse the Markdown chunk into a document fragment
          const fragment = defaultMarkdownParser.parse(content).content;
          const { state, dispatch } = editorView;
          const endPos = state.doc.content.size;
          const tr = state.tr.insert(endPos, fragment);
          dispatch(tr);
        } catch (err) {
          console.error('[CreationStreamingPlugin] Failed to insert stream fragment:', err);
        }
      };

      window.addEventListener('editor:stream-text', handleStream as EventListener);
      return {
        destroy() {
          window.removeEventListener('editor:stream-text', handleStream as EventListener);
        },
      };
    },
  });
} 