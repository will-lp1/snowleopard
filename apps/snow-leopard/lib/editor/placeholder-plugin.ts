import { Plugin, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/**
 * A ProseMirror plugin that adds a placeholder decoration to empty nodes.
 * @param text The placeholder text to display.
 */
export function placeholderPlugin(text: string) {
  const placeholderClass = 'is-placeholder-empty';
  return new Plugin({
    props: {
      decorations(state: EditorState): DecorationSet | null {
        const { doc } = state;
        const decorations: Decoration[] = [];

        // Check if the doc is empty (only one top-level node, usually a paragraph)
        if (doc.childCount === 1) {
          const firstChild = doc.firstChild;
          // Check if the first child is a text block and is empty
          if (
            firstChild?.isTextblock &&
            firstChild.content.size === 0
          ) {
            // Add a Node decoration to add the class to the paragraph itself
            decorations.push(
              Decoration.node(0, firstChild.nodeSize, {
                class: placeholderClass,
                'data-placeholder': text, // Pass text via data attribute for CSS
              })
            );
          }
        }

        // Return a DecorationSet, even if empty
        return DecorationSet.create(doc, decorations);
      },
    },
  });
} 