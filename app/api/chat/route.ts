import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { createClient } from '@/lib/supabase/server';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
  saveMessageContent,
  getDocumentById,
  getMessagesByChatId,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
  parseMessageContent,
  convertToUIMessages,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/api/chat/actions/chat';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
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
 * Creates an enhanced system prompt that includes active and mentioned document content
 */
async function createEnhancedSystemPrompt({
  selectedChatModel,
  activeDocumentId,
  mentionedDocumentIds,
}: { 
  selectedChatModel: string;
  activeDocumentId?: string | null;
  mentionedDocumentIds?: string[] | null;
}) {
  let basePrompt = systemPrompt({ selectedChatModel });
  let contextAdded = false;

  // Log that we're processing document context
  console.log(`[Chat API] Processing context. Active: ${activeDocumentId || 'none'}, Mentioned: ${mentionedDocumentIds?.length || 0}`);
  
  // --- Active Document Context --- 
  if (activeDocumentId) {
    try {
      const document = await getDocumentById({ id: activeDocumentId });
      
      if (document) {
        console.log(`[Chat API] Found active document for context: "${document.title}"`);
        const documentContext = `
CURRENT DOCUMENT CONTEXT (You can update this one using tools):
Title: ${document.title}
Content:
${document.content || '(Empty document)'}
`;
        basePrompt += `\n\n${documentContext}`;
        contextAdded = true;
      } else {
        console.warn(`[Chat API] Active document not found for ID: ${activeDocumentId}`);
      }
    } catch (error) {
      console.error('[Chat API] Error fetching active document for context:', error);
    }
  }

  // --- Mentioned Documents Context --- 
  if (mentionedDocumentIds && mentionedDocumentIds.length > 0) {
    basePrompt += `\n\n--- MENTIONED DOCUMENTS (for reference only) ---`;
    for (const mentionedId of mentionedDocumentIds) {
      // Avoid refetching if mentioned is same as active
      if (mentionedId === activeDocumentId) continue; 

      try {
        const document = await getDocumentById({ id: mentionedId });
        if (document) {
          console.log(`[Chat API] Found mentioned document for context: "${document.title}"`);
          const mentionedContext = `
MENTIONED DOCUMENT:
Title: ${document.title}
Content:
${document.content || '(Empty document)'}
`;
          basePrompt += `\n${mentionedContext}`;
          contextAdded = true;
        }
      } catch (error) {
        console.error(`[Chat API] Error fetching mentioned document ID ${mentionedId}:`, error);
      }
    }
    basePrompt += `\n--- END MENTIONED DOCUMENTS ---`;
  }

  if (contextAdded) {
    basePrompt += `\n\nPlease reference the provided document contexts when appropriate in your responses. Remember you can only suggest updates for the CURRENT DOCUMENT CONTEXT.`;
    console.log('[Chat API] Successfully enhanced system prompt with document context(s).');
  } else {
    console.log('[Chat API] No document context added to system prompt.');
  }
  
  return basePrompt;
}

// Helper function to update chat document context
async function updateChatContext({ 
  chatId, 
  context 
}: { 
  chatId: string; 
  context: { active?: string | null; mentioned?: string[] | null } 
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('Chat')
      .update({ document_context: context })
      .eq('id', chatId);
      
    if (error) {
      console.error('[Chat API] Error updating chat context:', error);
      throw error;
    }
    console.log(`[Chat API] Updated document_context for chat ${chatId}`, context);
  } catch (error) {
    console.error('[Chat API] Failed to update chat context:', error);
    throw error;
  }
}

// Get a chat by ID with its messages
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    // Use getUser() for validated session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    // Check for errors or missing user
    if (userError || !user) {
      console.error('User auth error in GET /api/chat:', userError);
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = user.id;

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');

    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 });
    }

    // Get chat details
    const chat = await getChatById({ id: chatId });
    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    // Only allow users to access their own chats
    if (chat.userId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get messages for this chat
    const dbMessages = await getMessagesByChatId({ id: chatId });
    
    // Convert database messages to the UI format using the existing utility
    const uiMessages = convertToUIMessages(dbMessages);
    
    // Return the chat with its messages in the UI-compatible format
    return new Response(JSON.stringify({
      ...chat,
      messages: uiMessages
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching chat:', error);
    return new Response('Error fetching chat', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    // Use getUser() for validated session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    // Check for errors or missing user
    if (userError || !user) {
      console.error('User auth error in POST /api/chat:', userError);
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = user.id;

    const {
      id: chatId,
      messages,
      selectedChatModel,
      // Get data object which now contains context IDs
      data: requestData,
    }: {
      id: string;
      messages: Array<Message>;
      selectedChatModel: string;
      data?: { 
        activeDocumentId?: string | null;
        mentionedDocumentIds?: string[] | null;
        // Retain flexibility for other potential data
        [key: string]: any; 
      }
    } = await request.json();

    // Extract IDs from requestData
    const activeDocumentId = requestData?.activeDocumentId;
    const mentionedDocumentIds = requestData?.mentionedDocumentIds;

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    // Validate chat ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(chatId)) {
      console.error(`[Chat API] Invalid chat ID format: ${chatId}`);
      return new Response('Invalid chat ID format', { status: 400 });
    }

    const chat = await getChatById({ id: chatId });

    // Create chat if it doesn't exist
    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });

      // Include document_context in the initial chat creation
      await saveChat({
        id: chatId,
        userId: userId, // Use validated userId
        title,
        document_context: {
          active: activeDocumentId ?? undefined,
          mentioned: mentionedDocumentIds ?? undefined
        }
      });
    } else {
      // Check ownership using validated userId
      if (chat.userId !== userId) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      // Update the document context for the existing chat
      await updateChatContext({ 
        chatId, 
        context: {
          active: activeDocumentId,
          mentioned: mentionedDocumentIds
        }
      });
    }

    // Generate a new backend ID for the user message
    const userMessageBackendId = generateUUID();

    await saveMessages({
      messages: [{
        id: userMessageBackendId, // Use the newly generated ID
        chatId: chatId,
        role: userMessage.role,
        content: '{}',
        createdAt: new Date().toISOString(),
      }],
    });

    await saveMessageContent({
      messageId: userMessageBackendId, // Use the same generated ID
      contents: parseMessageContent(userMessage.content),
    });

    // Adapt session for tools - IMPORTANT: If tools need session details beyond just user existence,
    // you might need to fetch the session here IF getUser() doesn't provide enough info.
    // However, adaptSession currently uses expires_in which isn't in the User object.
    // Let's fetch the session *here* only if needed, just before passing to tools.
    const { data: { session: toolSession } } = await supabase.auth.getSession(); 
    const adaptedSession = toolSession ? adaptSession(toolSession) : null;
    
    // Ensure adaptedSession is not null if tools require it
    if (!adaptedSession) {
      console.error('Failed to get session details needed for tools');
      return new Response('Internal Server Error', { status: 500 });
    }

    // Get enhanced system prompt with potentially both active and mentioned contexts
    const enhancedSystemPrompt = await createEnhancedSystemPrompt({
      selectedChatModel,
      activeDocumentId,
      mentionedDocumentIds,
    });

    // Validate the active document ID before passing it to tools
    let validatedActiveDocumentId: string | undefined = undefined;
    if (activeDocumentId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(activeDocumentId)) {
        validatedActiveDocumentId = activeDocumentId;
        console.log(`[Chat API] Validated active document ID for tools: ${validatedActiveDocumentId}`);
      } else {
        console.warn(`[Chat API] Invalid active document ID format, not passing to tools: ${activeDocumentId}`);
      }
    }

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: enhancedSystemPrompt,
          messages,
          maxSteps: 5,
          // Conditionally activate updateDocument tool ONLY if a valid active document ID exists
          experimental_activeTools:
            selectedChatModel === 'chat-model-large'
              ? []
              : validatedActiveDocumentId 
                ? ['updateDocument'] // Activate ONLY if active doc ID is valid
                : [], // No active doc = no update tool
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            // Keep createDocument always available 
            createDocument: createDocument({ session: adaptedSession, dataStream }),
            // Pass the validated *active* document ID to the update tool
            updateDocument: updateDocument({ 
              session: adaptedSession, 
              documentId: validatedActiveDocumentId // Ensure tool gets the active ID
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            if (userId) { // Check validated userId
              try {
                const sanitizedResponseMessages = sanitizeResponseMessages({
                  messages: response.messages,
                  reasoning,
                });

                await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => ({
                    id: message.id,
                    chatId: chatId,
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
                
                // Ensure the document_context is up to date after the conversation
                await updateChatContext({ 
                  chatId, 
                  context: {
                    active: activeDocumentId,
                    mentioned: mentionedDocumentIds
                  }
                });
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
    // Use getUser() for validated session
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    // Check for errors or missing user
    if (userError || !user) {
      console.error('User auth error in DELETE /api/chat:', userError);
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = user.id;

    const { searchParams } = new URL(request.url);
    const rawChatId = searchParams.get('id');

    if (!rawChatId) {
      return new Response('Chat ID is required', { status: 400 });
    }

    // Validate chat ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawChatId)) {
      return new Response('Invalid chat ID format', { status: 400 });
    }

    const chat = await getChatById({ id: rawChatId });

    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    // Check ownership using validated userId
    if (chat.userId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id: rawChatId });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return new Response('Error deleting chat', { status: 500 });
  }
}
