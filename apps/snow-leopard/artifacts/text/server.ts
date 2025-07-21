import { smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { getUpdateDocumentPrompt } from '@/lib/ai/prompts';

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async ({ title, dataStream }) => {

    const { fullStream } = streamText({
      model: myProvider.languageModel('chat-model-large'),
      system: `'Write about the given topic. Markdown is supported. Use headings wherever appropriate. Valid Markdown only, using headings (#, ##),
lists, bold, italics, and code blocks as needed',  
      `.trim(),
      experimental_transform: smoothStream({ chunking: 'line' }),
      prompt: title,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;

        // Stream the content - no need to accumulate it
        dataStream.writeData({
          type: 'text-delta',
          content: textDelta,
        });
      }
    }

    // No return value needed
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: `
Provide the revised document content in valid Markdown only, using headings (#, ##),
lists, bold, italics, and code blocks as needed. Show the complete updated document.
Do not include any commentary. Use changing sections in place.
      `.trim(),
      experimental_transform: smoothStream({ chunking: 'line' }),
      prompt: description,
      experimental_providerMetadata: {
        openai: {
          prediction: {
            type: 'content',
            content: document.content,
          },
        },
      },
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;

        draftContent += textDelta;
        dataStream.writeData({
          type: 'text-delta',
          content: textDelta,
        });
      }
    }

    return draftContent;
  },
});
