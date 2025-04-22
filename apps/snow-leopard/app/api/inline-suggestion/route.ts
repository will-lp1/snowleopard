import { NextResponse } from 'next/server';
import { streamText, smoothStream } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers

async function handleInlineSuggestionRequest(
  documentId: string,
  currentContent: string,
  contextAfter: string,
  fullContent: string,
  nodeType: string,
  userId: string, // Pass userId for validation
  aiOptions: { suggestionLength?: 'short' | 'medium' | 'long', customInstructions?: string }
) {
  // Validate document
  const document = await getDocumentById({ id: documentId });

  if (!document) {
    throw new Error('Document not found');
  }

  // Use passed userId for authorization check
  if (document.userId !== userId) { 
    throw new Error('Unauthorized');
  }

  // Create transform stream for sending server-sent events
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  let writerClosed = false;

  // Start processing in the background
  (async () => {
    try {
      console.log("Starting to process inline suggestion stream");
      
      // Process the suggestion
      await streamInlineSuggestion({
        document,
        currentContent,
        contextAfter,
        fullContent,
        nodeType,
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
            // Don't rethrow - just stop writing
          }
        }
      });

      // Signal completion
      if (!writerClosed) {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type: 'finish',
            content: ''
          })}\n\n`));
        } catch (error) {
          console.error('Error writing finish event:', error);
          // Don't rethrow - just stop writing
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
          // Don't rethrow - just stop writing
        }
      }
    } finally {
      if (!writerClosed) {
        try {
          writerClosed = true;
          await writer.close();
        } catch (error) {
          console.error('Error closing writer:', error);
          // Don't rethrow - just allow processing to complete
        }
      }
    }
  })();

  // Handle client disconnect through stream cleanup
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
      nodeType = 'paragraph',
      aiOptions = {}
    } = await request.json();

    if (!documentId || !currentContent) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Pass userId to handler
    return handleInlineSuggestionRequest(documentId, currentContent, contextAfter, fullContent, nodeType, userId, aiOptions);
  } catch (error: any) {
    console.error('Inline suggestion route error:', error);
    // Return NextResponse with error message
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
  }
}

async function streamInlineSuggestion({
  document,
  currentContent,
  contextAfter,
  fullContent,
  nodeType,
  aiOptions,
  write
}: {
  document: any;
  currentContent: string;
  contextAfter: string;
  fullContent: string;
  nodeType: string;
  aiOptions: { suggestionLength?: 'short' | 'medium' | 'long', customInstructions?: string };
  write: (type: string, content: string) => Promise<void>;
}) {
  console.log("Starting inline suggestion generation with options:", aiOptions);

  const contentType = detectContentType(currentContent, nodeType);
  
  const prompt = buildPrompt(
    currentContent,
    contextAfter,
    document.title || '',
    contentType,
    aiOptions?.suggestionLength
  );

  const maxTokens = { short: 20, medium: 50, long: 80 }[aiOptions?.suggestionLength || 'medium'];

  const { fullStream } = streamText({
    model: myProvider.languageModel('artifact-model'),
    system: getSystemPrompt(contentType, aiOptions?.customInstructions),
    experimental_transform: smoothStream({ chunking: 'word' }),
    prompt,
    temperature: contentType === 'code' ? 0.2 : 0.4,
    maxTokens: maxTokens,
    experimental_providerMetadata: {
      openai: {
        prediction: {
          type: 'content',
          content: currentContent,
        }
      }
    }
  });

  let suggestionContent = '';
  for await (const delta of fullStream) {
    const { type } = delta;

    if (type === 'text-delta') {
      const { textDelta } = delta;
      
      if (shouldStopGeneration(textDelta, suggestionContent, contentType)) {
        break;
      }

      suggestionContent += textDelta;
      await write('suggestion-delta', textDelta);
    }
  }
}

function detectContentType(
  content: string, 
  nodeType: string
): 'code' | 'text' {
  // Simple check for code vs text
  if (nodeType === 'code_block') return 'code';
  
  // Quick check for code-like content
  if (content.match(/^(function|const|let|var|import|export|class|if|for|while)\b/) ||
      content.includes('{') || content.includes('}') ||
      content.includes(';') || content.includes('=>')) {
    return 'code';
  }

  return 'text';
}

function getSystemPrompt(contentType: 'code' | 'text', customInstructions?: string): string {
  let basePrompt: string;

  if (contentType === 'code') {
    basePrompt = `You are a code completion assistant. Complete the code naturally, following the established style and patterns.
Keep suggestions concise and focused on the immediate next tokens.
- Match indentation and code style
- Complete logical structures
- Use valid syntax
- Don't add comments unless continuing one
- Stop at natural boundaries (semicolons, brackets, etc.)`;
  } else {
    basePrompt = `You are a writing assistant providing quick, natural text completions.
Your goal is to predict the next few words that would naturally follow the cursor position.
- Match the exact tone and style of the text
- Keep suggestions short (5-10 words) and natural
- Focus on immediate context
- Stop at natural boundaries (periods, commas, etc.)
- **Do NOT add quotation marks unless continuing an existing quote.**
- Don't complete entire sentences or paragraphs`;
  }

  if (customInstructions) {
    basePrompt += `\n\nFollow these user instructions:\n${customInstructions}`;
  }

  return basePrompt;
}

function buildPrompt(
  currentContent: string,
  contextAfter: string,
  documentTitle: string,
  contentType: 'code' | 'text',
  suggestionLength: 'short' | 'medium' | 'long' = 'medium'
): string {
  const contextWindow = contentType === 'code' ? 500 : 200;
  const relevantContent = currentContent.slice(-contextWindow);

  let prompt = `Complete this ${contentType === 'code' ? 'code' : 'text'} naturally.${
    documentTitle ? ` Document: "${documentTitle}"` : ''
  }\n\nCurrent content (cursor at end):\n"""\n${relevantContent}\n"""`;

  if (contextAfter && contextAfter.length < 100) {
    prompt += `\n\nWhat follows (for context only):\n"""\n${contextAfter}\n"""`;
  }

  const lengthInstruction = {
    short: 'Suggest the next 1-5 words.',
    medium: 'Suggest the next 5-10 words.',
    long: 'Suggest the next 10-15 words.',
  }[suggestionLength];

  prompt += `\n\nProvide a natural, immediate continuation from the cursor position.${
    contentType === 'code'
      ? ' Complete the current code construct.'
      : ` ${lengthInstruction} Do NOT add quotation marks unless continuing an existing quote.`
  }`;

  return prompt;
}

function shouldStopGeneration(delta: string, currentSuggestion: string, contentType: 'code' | 'text'): boolean {
  const combined = currentSuggestion + delta;
  const wordCount = combined.trim().split(/\s+/).length;

  // Universal length limit based roughly on words
  if (wordCount > 18) return true; // Absolute max words

  if (contentType === 'code') {
    return combined.includes(';') ||
           combined.includes('}') ||
           combined.includes('{') ||
           combined.includes('\n') ||
           combined.includes('//') ||
           combined.match(/\([^)]*\)/) !== null;
  }

  // Text boundaries - stop *before* adding an unnecessary quote
  if (delta.trim() === '"' && !currentSuggestion.endsWith('"') && !currentSuggestion.match(/["']$/)) return true;

  return combined.includes('.') ||
         combined.includes('?') ||
         combined.includes('!') ||
         combined.includes(',') ||
         combined.includes('\n') ||
         combined.includes(';') ||
         combined.includes(':') ||
         wordCount > 15; // Stop after a good number of words
} 