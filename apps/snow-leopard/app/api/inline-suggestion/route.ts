import { NextResponse } from 'next/server';
import { streamText } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';

async function handleInlineSuggestionRequest(
  documentId: string,
  currentContent: string,
  userId: string,
  suggestionLength: 'short' | 'medium' | 'long' = 'medium',
  customInstructions?: string | null
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

      await streamInlineSuggestion({ document, currentContent, suggestionLength, customInstructions, write: async (type, content) => {
        if (writerClosed) return;

        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type,
            content
          })}\n\n`));
        } catch (error) {
          console.error('Error writing to stream:', error);
        }
      } });

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

    const { documentId, currentContent, aiOptions = {} } = await request.json();
    const { suggestionLength, customInstructions } = aiOptions;

    if (!documentId || !currentContent) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    return handleInlineSuggestionRequest(documentId, currentContent, userId, suggestionLength, customInstructions);
  } catch (error: any) {
    console.error('Inline suggestion route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
  }
}

async function streamInlineSuggestion({
  document,
  currentContent,
  suggestionLength,
  customInstructions,
  write
}: {
  document: any;
  currentContent: string;
  suggestionLength: 'short' | 'medium' | 'long';
  customInstructions?: string | null;
  write: (type: string, content: string) => Promise<void>;
}) {
  console.log("Starting text inline suggestion generation with options:", { suggestionLength, customInstructions });

  const prompt = buildPrompt(currentContent, suggestionLength, customInstructions);

  const maxTokens = { short: 20, medium: 50, long: 80 }[suggestionLength || 'medium'];

  const { fullStream } = streamText({
    model: myProvider.languageModel('artifact-model'),
    system: getSystemPrompt(),
    prompt,
    temperature: 0.4,
    maxTokens,
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

function getSystemPrompt(): string {
  return `You are a helpful assistant that continues the given text. Only output the continuation without extra commentary or quotes.`;
}

function buildPrompt(
  currentContent: string,
  suggestionLength: 'short' | 'medium' | 'long' = 'medium',
  customInstructions?: string | null
): string {
  const contextWindow = 200;
  const relevantContent = currentContent.slice(-contextWindow);
  const lengthMap = { short: '1-5 words', medium: '5-10 words', long: '10-15 words' };
  const lengthInstruction = lengthMap[suggestionLength] || lengthMap.medium;
  let promptContent = `Text before cursor:\n"""${relevantContent}"""\n\nContinue this text with ${lengthInstruction}.`;
  if (customInstructions) {
    promptContent = `${customInstructions}\n\n${promptContent}`;
  }
  return promptContent;
} 