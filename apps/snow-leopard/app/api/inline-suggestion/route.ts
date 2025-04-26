import { NextResponse } from 'next/server';
import { streamText, smoothStream } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';

async function handleInlineSuggestionRequest(
  documentId: string,
  currentContent: string,
  contextAfter: string,
  fullContent: string,
  userId: string,
  aiOptions: { suggestionLength?: 'short' | 'medium' | 'long', customInstructions?: string }
) {
  const document = await getDocumentById({ id: documentId });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== userId) {
    throw new Error('Unauthorized');
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  let writerClosed = false;

  (async () => {
    try {
      console.log("Starting to process inline suggestion stream");

      await streamInlineSuggestion({
        document,
        currentContent,
        contextAfter,
        fullContent,
        aiOptions,
        write: async (type, content) => {
          if (writerClosed) return;

          try {
            await writer.write(encoder.encode(`data: ${JSON.stringify({
              type,
              content
            })}\n\n`));
          } catch (error) {
            console.error('Error writing to stream:', error);
          }
        }
      });

      if (!writerClosed) {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'finish',
            content: ''
          })}\n\n`));
        } catch (error) {
          console.error('Error writing finish event:', error);
        }
      }
    } catch (e: any) {
      console.error('Error in stream processing:', e);
      if (!writerClosed) {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            content: e.message || 'An error occurred'
          })}\n\n`));
        } catch (error) {
          console.error('Error writing error event:', error);
        }
      }
    } finally {
      if (!writerClosed) {
        try {
          writerClosed = true;
          await writer.close();
        } catch (error) {
          console.error('Error closing writer:', error);
        }
      }
    }
  })();

  try {
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    writerClosed = true;
    console.error('Error creating response:', error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    // --- Authentication ---
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
    }
    const userId = session.user.id;

    const {
      documentId,
      currentContent,
      contextAfter = '',
      fullContent = '',
      aiOptions = {}
    } = await request.json();

    if (!documentId || !currentContent) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    return handleInlineSuggestionRequest(documentId, currentContent, contextAfter, fullContent, userId, aiOptions);
  } catch (error: any) {
    console.error('Inline suggestion route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
  }
}

async function streamInlineSuggestion({
  document,
  currentContent,
  contextAfter,
  fullContent,
  aiOptions,
  write
}: {
  document: any;
  currentContent: string;
  contextAfter: string;
  fullContent: string;
  aiOptions: { suggestionLength?: 'short' | 'medium' | 'long', customInstructions?: string };
  write: (type: string, content: string) => Promise<void>;
}) {
  console.log("Starting text inline suggestion generation with options:", aiOptions);

  const prompt = buildPrompt(
    currentContent,
    contextAfter,
    document.title || '',
    aiOptions?.suggestionLength
  );

  const maxTokens = { short: 20, medium: 50, long: 80 }[aiOptions?.suggestionLength || 'medium'];

  const { fullStream } = streamText({
    model: myProvider.languageModel('artifact-model'),
    system: getSystemPrompt(aiOptions?.customInstructions),
    experimental_transform: smoothStream({ chunking: 'word' }),
    prompt,
    temperature: 0.4, // Fixed temperature for text
    maxTokens: maxTokens,
  });

  let suggestionContent = '';
  for await (const delta of fullStream) {
    const { type } = delta;

    if (type === 'text-delta') {
      const { textDelta } = delta;

      suggestionContent += textDelta;
      await write('suggestion-delta', textDelta);
    }
  }
}

function getSystemPrompt(customInstructions?: string): string {
  let basePrompt = `You are a writing assistant providing quick, natural text completions.
Your goal is to predict the next few words that would naturally follow the cursor position.
- Match the exact tone and style of the text.
- Keep suggestions short (typically 5-10 words) and natural.
- Focus on the immediate context.
- Stop at natural sentence boundaries (like periods, commas, question marks).
- **CRITICAL: Do NOT add quotation marks (single or double) unless the existing text already ends with an open quote that you are continuing.**
- Do not complete entire sentences or paragraphs unless it's extremely short and obvious.
- Be concise and directly continue the thought.`;

  if (customInstructions) {
    basePrompt += `\n\nFollow these user instructions:\n${customInstructions}`;
  }

  return basePrompt;
}

function buildPrompt(
  currentContent: string,
  contextAfter: string,
  documentTitle: string,
  suggestionLength: 'short' | 'medium' | 'long' = 'medium'
): string {
  const contextWindow = 250; // Increased slightly for more text context
  const relevantContent = currentContent.slice(-contextWindow);

  let prompt = `You are completing text in a document.${
    documentTitle ? ` Document title: "${documentTitle}"` : ''
  }\n\nThe user's cursor is at the end of the following text:\n"""\n${relevantContent}\n"""`;

  // Limit contextAfter to prevent overly long prompts and reduce cost/latency
  const maxContextAfterLength = 150;
  if (contextAfter && contextAfter.trim().length > 0) {
      const truncatedContextAfter = contextAfter.length > maxContextAfterLength
          ? contextAfter.substring(0, maxContextAfterLength) + "..."
          : contextAfter;
      prompt += `\n\nFor context, this is the text immediately *after* the cursor (do not repeat this):\n"""\n${truncatedContextAfter}\n"""`;
  }

  const lengthInstruction = {
    short: 'Suggest only the immediate next 1-5 words.',
    medium: 'Suggest the next 5-10 words.',
    long: 'Suggest the next 10-15 words.',
  }[suggestionLength];

  prompt += `\n\nProvide a natural, immediate continuation of the text. ${lengthInstruction} Follow the system prompt rules precisely, especially regarding quotation marks.`;

  return prompt;
} 