import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { DataStreamWriter, createDataStreamResponse, smoothStream, streamText } from 'ai';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { updateDocumentPrompt } from '@/lib/ai/prompts';

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
      description,
      selectedText
    } = await request.json();

    if (!documentId) {
      return new Response('Missing documentId', { status: 400 });
    }

    const document = await getDocumentById({ id: documentId });

    if (!document) {
      return new Response('Document not found', { status: 404 });
    }

    if (document.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
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

        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'title',
          content: document.title
        })}\n\n`));

        await writer.write(encoder.encode(`data: ${JSON.stringify({
          type: 'kind',
          content: document.kind
        })}\n\n`));

        // Handle partial edit vs full document
        const isPartialEdit = !!selectedText;
        
        if (isPartialEdit) {
          console.log("Processing partial edit with selected text:", selectedText);
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
      } catch (e) {
        console.error('Error in stream processing:', e);
      } finally {
        await writer.close();
        console.log("Stream closed");
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    console.error('Suggestion route error:', error);
    return NextResponse.json({ error }, { status: 400 });
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
    ? `I want to modify a specific part of a document. Here's the selected text: "${selectedText}"\n\nI want you to: ${description}`
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