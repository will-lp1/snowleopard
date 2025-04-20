import { NextResponse } from 'next/server';
import { streamText, smoothStream } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers

// Common function to handle streaming the response
async function handleSuggestionRequest(
  documentId: string,
  description: string,
  userId: string, // Pass userId for validation
  selectedText?: string
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

  // Start processing in the background
  (async () => {
    try {
      console.log("Starting to process suggestion stream");
      
      // Send initial document info
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'id',
        content: documentId
      })}\n\n`));

      // Handle partial edit vs full document
      const isPartialEdit = !!selectedText;
      
      if (isPartialEdit) {
        console.log("Processing partial edit with selected text");
        // Send original content
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'original',
          content: selectedText
        })}\n\n`));
      } else {
        console.log("Processing full document edit");
        // Clear current content if editing the whole document
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'clear',
          content: ''
        })}\n\n`));
      }

      // Process the suggestion
      console.log("Starting to stream suggestion with prompt:", description);
      await streamSuggestion({
        document,
        description,
        selectedText,
        write: async (type, content) => {
          await writer.write(encoder.encode(`data: ${JSON.stringify({
            type,
            content
          })}\n\n`));
        }
      });

      // Signal completion
      console.log("Finished processing suggestion, sending finish event");
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'finish',
        content: ''
      })}\n\n`));
    } catch (e: any) {
      console.error('Error in stream processing:', e);
      // Send error message to client
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        content: e.message || 'An error occurred'
      })}\n\n`));
    } finally {
      await writer.close();
      console.log("Stream closed");
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  });
}

// GET handler for EventSource streaming
export async function GET(request: Request) {
  try {
    // --- Authentication --- 
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
    }
    const userId = session.user.id;

    // Get params from URL
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    const description = url.searchParams.get('description');
    const selectedText = url.searchParams.get('selectedText') || undefined;

    if (!documentId || !description) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Pass userId to handler
    return handleSuggestionRequest(documentId, description, userId, selectedText);
  } catch (error: any) {
    console.error('Suggestion GET route error:', error);
    // Return NextResponse with error message
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
  }
}

// POST handler for backward compatibility
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
      description,
      selectedText
    } = await request.json();

    if (!documentId || !description) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Pass userId to handler
    return handleSuggestionRequest(documentId, description, userId, selectedText);
  } catch (error: any) {
    console.error('Suggestion POST route error:', error);
    // Return NextResponse with error message
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
  }
}

async function streamSuggestion({
  document,
  description,
  selectedText,
  write
}: {
  document: any;
  description: string;
  selectedText?: string;
  write: (type: string, content: string) => Promise<void>;
}) {
  let draftContent = '';
  const contentToModify = selectedText || document.content;
  const promptContext = selectedText 
    ? `I want to modify a specific part of a document. Here's the selected text: "${selectedText}"\n\nI want you to: ${description} - NEVER INCLUDE ANYTHING IN THE OUTPUT OTHER THAN THE MODIFIED TEXT`
    : description;

  console.log("Starting stream text generation with content length:", contentToModify.length);

  const { fullStream } = streamText({
    model: myProvider.languageModel('artifact-model'),
    system: updateDocumentPrompt(contentToModify, 'text'),
    experimental_transform: smoothStream({ chunking: 'word' }),
    prompt: promptContext,
    experimental_providerMetadata: {
      openai: {
        prediction: {
          type: 'content',
          content: contentToModify,
        }
      }
    }
  });

  let chunkCount = 0;
  for await (const delta of fullStream) {
    const { type } = delta;

    if (type === 'text-delta') {
      const { textDelta } = delta;
      draftContent += textDelta;
      chunkCount++;

      // Log progress every 10 chunks
      if (chunkCount % 10 === 0) {
        console.log(`Stream progress: ${draftContent.length} characters processed (${chunkCount} chunks)`);
      }

      await write('suggestion-delta', textDelta);
    }
  }

  console.log(`Stream complete: Generated ${draftContent.length} characters in ${chunkCount} chunks`);
} 