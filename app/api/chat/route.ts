import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { createClient } from '@/utils/supabase/server';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
  saveMessageContent,
  getDocumentById,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
  parseMessageContent,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/chat/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { isProductionEnvironment } from '@/lib/constants';
import { NextResponse } from 'next/server';
import { myProvider } from '@/lib/ai/providers';

export const maxDuration = 60;

// Convert Supabase session to format expected by tools
function adaptSession(supabaseSession: any) {
  return {
    ...supabaseSession,
    expires: new Date(supabaseSession.expires_in ?? 0).toISOString(),
  };
}

/**
 * Creates an enhanced system prompt that includes document content
 */
async function createEnhancedSystemPrompt({
  selectedChatModel, 
  documentId
}: { 
  selectedChatModel: string;
  documentId?: string | null;
}) {
  let basePrompt = systemPrompt({ selectedChatModel });
  
  // Log that we're processing document context
  console.log(`[Chat API] Processing document context, documentId: ${documentId || 'none'}`);
  
  // If there's a document ID, fetch the document content
  if (documentId) {
    try {
      const document = await getDocumentById({ id: documentId });
      
      if (document) {
        // Log successful document retrieval
        console.log(`[Chat API] Found document for context: "${document.title}", content length: ${document.content?.length || 0} chars`);
        
        // Add document content to the system prompt
        const documentContext = `
CURRENT DOCUMENT CONTEXT:
Title: ${document.title}
Content:
${document.content || '(Empty document)'}

Please reference this document when appropriate in your responses.
You can suggest changes to this document based on our conversation.
`;
        // Append document context to the system prompt
        basePrompt = `${basePrompt}\n\n${documentContext}`;
        console.log('[Chat API] Successfully enhanced system prompt with document context');
      } else {
        console.warn(`[Chat API] Document not found for ID: ${documentId}`);
      }
    } catch (error) {
      console.error('Error fetching document for context:', error);
      // Continue with base prompt if document fetching fails
    }
  }
  
  return basePrompt;
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
      id,
      messages,
      selectedChatModel,
      documentId, // Accept documentId to provide document context
    }: {
      id: string;
      messages: Array<Message>;
      selectedChatModel: string;
      documentId?: string | null;
    } = await request.json();

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });

      await saveChat({ id, userId: session.user.id, title });
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    await saveMessages({
      messages: [{
        id: userMessage.id,
        chatId: id,
        role: userMessage.role,
        content: '{}',
        createdAt: new Date().toISOString(),
      }],
    });

    await saveMessageContent({
      messageId: userMessage.id,
      contents: parseMessageContent(userMessage.content),
    });

    const adaptedSession = adaptSession(session);
    
    // Get enhanced system prompt with document context if available
    const enhancedSystemPrompt = await createEnhancedSystemPrompt({
      selectedChatModel,
      documentId,
    });

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: enhancedSystemPrompt,
          messages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  // If we have a document context, prefer updateDocument over createDocument
                  documentId ? 'updateDocument' : 'createDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            createDocument: createDocument({ session: adaptedSession, dataStream }),
            updateDocument: updateDocument({ 
              session: adaptedSession, 
              dataStream,
              // Pass the current document ID to make it easier to update
              documentId: documentId || undefined
            }),
            requestSuggestions: requestSuggestions({
              session: adaptedSession,
              dataStream,
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            if (session.user?.id) {
              try {
                const sanitizedResponseMessages = sanitizeResponseMessages({
                  messages: response.messages,
                  reasoning,
                });

                await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => ({
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: '{}',
                    createdAt: new Date().toISOString(),
                  })),
                });

                await Promise.all(
                  sanitizedResponseMessages.map((message) =>
                    saveMessageContent({
                      messageId: message.id,
                      contents: parseMessageContent(message.content),
                    })
                  )
                );
              } catch (error) {
                console.error('Failed to save chat:', error);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return new Response('Authentication error', { status: 401 });
    }

    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return new Response('Not Found', { status: 404 });
    }

    const chat = await getChatById({ id });

    if (!chat || chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    console.error('Delete chat error:', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
