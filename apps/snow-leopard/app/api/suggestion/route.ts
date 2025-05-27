import { NextResponse } from 'next/server';
import { streamText, smoothStream } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';

async function handleSuggestionRequest(
  documentId: string,
  description: string,
  userId: string,
  selectedText?: string
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

  (async () => {
    try {
      console.log("Starting to process suggestion stream");
      
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'id',
        content: documentId
      })}\n\n`));

      const isPartialEdit = !!selectedText;
      
      if (isPartialEdit) {
        console.log("Processing partial edit with selected text");
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'original',
          content: selectedText
        })}\n\n`));
      } else {
        console.log("Processing full document edit");
        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'clear',
          content: ''
        })}\n\n`));
      }

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

      console.log("Finished processing suggestion, sending finish event");
      await writer.write(encoder.encode(`data: ${JSON.stringify({
        type: 'finish',
        content: ''
      })}\n\n`));
    } catch (e: any) {
      console.error('Error in stream processing:', e);
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

export async function GET(request: Request) {
  try {
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    const description = url.searchParams.get('description');
    const selectedText = url.searchParams.get('selectedText') || undefined;

    if (!documentId || !description) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    return handleSuggestionRequest(documentId, description, userId, selectedText);
  } catch (error: any) {
    console.error('Suggestion GET route error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 400 });
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
    const userId = session.user.id;

    const {
      documentId,
      description,
      selectedText
    } = await request.json();

    if (!documentId || !description) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    return handleSuggestionRequest(documentId, description, userId, selectedText);
  } catch (error: any) {
    console.error('Suggestion POST route error:', error);
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
    ? `You are an expert text editor. Your task is to refine a given piece of text based on a specific instruction.
Original selected text:
"""
${selectedText}
"""

Instruction: "${description}"

Please provide ONLY the modified version of the selected text.
If the instruction implies a small change, try to keep the rest of the original text intact as much as possible.
Only output the resulting text, with no preamble or explanation.`
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

      if (chunkCount % 10 === 0) {
        console.log(`Stream progress: ${draftContent.length} characters processed (${chunkCount} chunks)`);
      }

      await write('suggestion-delta', textDelta);
    }
  }

  console.log(`Stream complete: Generated ${draftContent.length} characters in ${chunkCount} chunks`);
} 