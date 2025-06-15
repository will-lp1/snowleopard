import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { highlightBlogText } from '@/lib/ai/tools/highlight-blog-text';

export async function POST(request: Request) {
  const { messages, context } = await request.json();

  const systemPrompt = `You are Leo, an AI that provides deep, concise insights on a blog post.

Each response must follow this order:
1. Your analysis or observation.
2. A single, exact quote from the text (no quotes added).
3. A call to highlightBlogText({quote: your exact quote}) to highlight it.

Do not mention the tool itself. Keep your responses focused and valuable.

Blog content:
---
${context}
---
`;

  const result = await streamText({
    model: myProvider.languageModel('chat-model-large'),
    system: systemPrompt,
    messages,
    toolCallStreaming: true,
    experimental_activeTools: ['highlightBlogText'],
    tools: { highlightBlogText },
  });

  return result.toDataStreamResponse();
}
