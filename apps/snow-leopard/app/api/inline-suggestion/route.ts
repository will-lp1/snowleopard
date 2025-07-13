import { NextResponse } from 'next/server';
import { streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

async function handleInlineSuggestionRequest(
  contextBefore: string,
  contextAfter: string,
  fullContent: string,
  suggestionLength: 'short' | 'medium' | 'long' = 'medium',
  customInstructions?: string | null,
  writingStyleSummary?: string | null,
  applyStyle: boolean = true
) {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  let writerClosed = false;

  (async () => {
    try {
      console.log("Starting to process inline suggestion stream");

      await streamInlineSuggestion({ contextBefore, contextAfter, fullContent, suggestionLength, customInstructions, writingStyleSummary, applyStyle, write: async (type, content) => {
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
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
    }
    const { contextBefore = '', contextAfter = '', fullContent = '', aiOptions = {} } = await request.json();
    const { suggestionLength, customInstructions, writingStyleSummary, applyStyle } = aiOptions;

    return handleInlineSuggestionRequest(contextBefore, contextAfter, fullContent, suggestionLength, customInstructions, writingStyleSummary, applyStyle);
  } catch (error: any) {
    console.error('Inline suggestion route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
  }
}

async function streamInlineSuggestion({
  contextBefore,
  contextAfter,
  suggestionLength,
  customInstructions,
  writingStyleSummary,
  applyStyle,
  write
}: {
  contextBefore: string;
  contextAfter: string;
  fullContent?: string;
  suggestionLength: 'short' | 'medium' | 'long';
  customInstructions?: string | null;
  writingStyleSummary?: string | null;
  applyStyle: boolean;
  write: (type: string, content: string) => Promise<void>;
}) {
  const prompt = buildPrompt({ contextBefore, contextAfter, suggestionLength, customInstructions, writingStyleSummary, applyStyle });

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

interface BuildPromptParams {
  contextBefore: string;
  contextAfter: string;
  suggestionLength: 'short' | 'medium' | 'long';
  customInstructions?: string | null;
  writingStyleSummary?: string | null;
  applyStyle: boolean;
}

function buildPrompt({
  contextBefore,
  contextAfter,
  suggestionLength,
  customInstructions,
  writingStyleSummary,
  applyStyle,
}: BuildPromptParams): string {
  const contextWindow = 200;
  const beforeSnippet = contextBefore.slice(-contextWindow);
  const afterSnippet = contextAfter.slice(0, contextWindow);

  const wordLimitMap = { short: 5, medium: 10, long: 15 } as const;
  const wordLimit = wordLimitMap[suggestionLength] ?? 10;

  let prompt = `<task>
You are an autocompletion system that suggests text completions between the given snippets.

Rules:
- Suggest up to ${wordLimit} words maximum.
- Maintain the original tone and meaning.
- Return ONLY the continuation text (no quotes, tags, or surrounding punctuation beyond what naturally fits).
</task>`;

  if (customInstructions) {
    prompt += `\n\n<instructions>\n${customInstructions}\n</instructions>`;
  }

  if (applyStyle && writingStyleSummary) {
    prompt += `\n\n<style-guide>\n${writingStyleSummary}\n</style-guide>`;
  }

  prompt += `\n\n<input>\n${beforeSnippet}▮${afterSnippet}\n</input>\n\nYour completion:`;

  return prompt;
} 