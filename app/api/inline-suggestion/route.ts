import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { streamText, smoothStream } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';

async function handleInlineSuggestionRequest(
  documentId: string,
  currentContent: string,
  contextAfter: string,
  nodeType: string,
  session?: any
) {
  // Validate document
  const document = await getDocumentById({ id: documentId });

  if (!document) {
    throw new Error('Document not found');
  }

  if (document.userId !== session?.user?.id) {
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
        nodeType,
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
    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return new Response('Authentication error', { status: 401 });
    }

    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const {
      documentId,
      currentContent,
      contextAfter = '',
      nodeType = 'paragraph'
    } = await request.json();

    if (!documentId || !currentContent) {
      return new Response('Missing parameters', { status: 400 });
    }

    return handleInlineSuggestionRequest(documentId, currentContent, contextAfter, nodeType, session);
  } catch (error) {
    console.error('Inline suggestion route error:', error);
    return NextResponse.json({ error }, { status: 400 });
  }
}

async function streamInlineSuggestion({
  document,
  currentContent,
  contextAfter,
  nodeType,
  write
}: {
  document: any;
  currentContent: string;
  contextAfter: string;
  nodeType: string;
  write: (type: string, content: string) => Promise<void>;
}) {
  console.log("Starting inline suggestion generation");

  // Analyze the content to determine the type
  const contentType = detectContentType(currentContent, nodeType);
  const prompt = buildPrompt(currentContent, contextAfter, contentType);

  const { fullStream } = streamText({
    model: myProvider.languageModel('artifact-model'),
    system: getSystemPrompt(contentType),
    experimental_transform: smoothStream({ chunking: 'word' }),
    prompt,
    temperature: 0.3,
    maxTokens: 100,
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
      
      // Stop if we hit a natural ending
      if (shouldStopGeneration(textDelta, suggestionContent, contentType)) {
        break;
      }

      suggestionContent += textDelta;
      await write('suggestion-delta', textDelta);
    }
  }
}

function detectContentType(content: string, nodeType: string): 'code' | 'markdown' | 'text' {
  // First check node type
  if (nodeType === 'code_block') return 'code';
  if (nodeType === 'heading') return 'markdown';

  // Then check content patterns
  if (content.includes('{') || content.includes('}') || 
      content.includes('function') || content.includes('const ') ||
      content.includes('let ') || content.includes('var ') ||
      content.includes('import ') || content.includes('export ')) {
    return 'code';
  }

  if (content.includes('#') || content.includes('```') ||
      content.includes('*') || content.includes('- ') ||
      content.includes('> ')) {
    return 'markdown';
  }

  return 'text';
}

function getSystemPrompt(contentType: 'code' | 'markdown' | 'text'): string {
  switch (contentType) {
    case 'code':
      return `You are an intelligent code completion assistant. Complete the code naturally based on the context.
Focus on predicting the most likely next tokens. Keep suggestions concise and follow the established code style.
Only suggest valid syntax. Do not include comments or documentation unless specifically continuing an existing comment.`;
    
    case 'markdown':
      return `You are a markdown completion assistant. Complete the markdown naturally based on the context.
Focus on continuing the current section or starting a logical next section. Maintain consistent formatting.
If completing a list, maintain the same list style. If completing a heading, maintain the same level.`;
    
    default:
      return `You are an intelligent text completion assistant. Complete the text naturally based on the context.
Focus on predicting what comes next while maintaining the writing style and tone. Keep the voice consistent.
Pay attention to sentence structure and paragraph flow. Suggest natural continuations that fit the context.`;
  }
}

function buildPrompt(currentContent: string, contextAfter: string, contentType: 'code' | 'markdown' | 'text'): string {
  let prompt = `Complete this ${contentType} naturally. Here's what comes before the cursor:\n\n${currentContent}\n\n`;
  
  if (contextAfter) {
    prompt += `And here's some context after the cursor (but don't repeat this exactly):\n\n${contextAfter}\n\n`;
  }

  prompt += `Continue from the cursor position with a natural completion. Keep it concise and relevant.
Pay attention to any patterns or structures in the existing content and maintain them.
For example, if there's a specific coding style or text formatting, follow that same style.`;
  
  return prompt;
}

function shouldStopGeneration(delta: string, currentSuggestion: string, contentType: 'code' | 'markdown' | 'text'): boolean {
  const combined = currentSuggestion + delta;
  
  // Common stop conditions
  if (combined.length > 100 || combined.includes('\n\n')) return true;

  // Content-specific stop conditions
  switch (contentType) {
    case 'code':
      return combined.includes('}') || 
             combined.includes(';') ||
             combined.includes('return ') ||
             combined.includes('\n');
    
    case 'markdown':
      return combined.includes('\n#') || 
             combined.includes('\n- ') ||
             combined.includes('\n1. ');
    
    case 'text':
      return combined.includes('. ') ||
             combined.includes('? ') ||
             combined.includes('! ');
  }

  return false;
} 