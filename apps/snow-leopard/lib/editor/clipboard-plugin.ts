import { Plugin } from 'prosemirror-state';
import { DOMSerializer } from 'prosemirror-model';
import { documentSchema } from './basic-schema';

export const clipboardPlugin = new Plugin({
  props: {
    clipboardHTMLSerializer(slice) {
      const div = document.createElement('div');
      const serializer = DOMSerializer.fromSchema(documentSchema);
      div.appendChild(serializer.serializeFragment(slice.content));

      // Remove helper spans we don't want in clipboard
      div.querySelectorAll('[data-diff], .suggestion-decoration-inline, .inline-suggestion-loader')
        .forEach(el => el.remove());

      // Convert <br> to newlines to avoid hard line breaks in Word
      div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      return div.innerHTML;
    },
    clipboardTextSerializer(slice) {
      return slice.content.textBetween(0, slice.content.size, '\n');
    },
  },
});
