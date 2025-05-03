import {
  type Message,
  createDataStreamResponse,
  streamText,
  smoothStream,
} from 'ai';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
  getDocumentById,
  getMessagesByChatId,
  updateChatContextQuery,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
  parseMessageContent,
  convertToUIMessages,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/api/chat/actions/chat';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { streamingDocument } from '@/lib/ai/tools/document-streaming';
import { isProductionEnvironment } from '@/lib/constants';
import { NextResponse } from 'next/server';
import { myProvider } from '@/lib/ai/providers';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';
import { ArtifactKind } from '@/components/artifact';
import type { Document } from '@snow-leopard/db';
import { createDocument as aiCreateDocument } from '@/lib/ai/tools/create-document';

export const maxDuration = 60;

/**
 * Creates an enhanced system prompt that includes active and mentioned document content
 */
async function createEnhancedSystemPrompt({
  selectedChatModel,
  activeDocumentId,
  mentionedDocumentIds,
  availableTools = ['createDocument','streamingDocument','updateDocument'] as Array<'createDocument'|'streamingDocument'|'updateDocument'>,
}: {
  selectedChatModel: string;
  activeDocumentId?: string | null;
  mentionedDocumentIds?: string[] | null;
  availableTools?: Array<'createDocument'|'streamingDocument'|'updateDocument'>;
}) {
  // Build the base prompt with only the allowed tools
  let basePrompt = systemPrompt({ selectedChatModel, availableTools });
  let contextAdded = false;

  // Explicitly ask the reasoning model to use think tags
  if (selectedChatModel === 'chat-model-reasoning') {
    basePrompt += "\n\nIMPORTANT: Think step-by-step about your plan using <think> tags before generating the response.";
  }

  // Log the model received by the prompt function
  console.log(`[createEnhancedSystemPrompt] Received model: ${selectedChatModel}`);

  // Log that we're processing document context
  console.log(`[Chat API] Processing context. Active: ${activeDocumentId || 'none'}, Mentioned: ${mentionedDocumentIds?.length || 0}`);
  
  // --- Active Document Context --- 
  if (activeDocumentId) {
    try {
      const document = await getDocumentById({ id: activeDocumentId });
      if (document) {
        console.log(`[Chat API] Found active document for context: "${document.title}"`);
        const documentContext = `
CURRENT DOCUMENT:
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
    basePrompt += `\n\n--- MENTIONED DOCUMENTS (do not modify) ---`;
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
    console.log('[Chat API] Successfully added document context to system prompt.');
  } else {
    console.log('[Chat API] No document context added to system prompt.');
  }
  
  return basePrompt;
}

// Get a chat by ID with its messages
export async function GET(request: Request) {
  try {
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      console.error('User auth error in GET /api/chat');
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('id');

    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 });
    }

    const chat = await getChatById({ id: chatId });
    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    if (chat.userId !== userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const dbMessages = await getMessagesByChatId({ id: chatId });
    const uiMessages = convertToUIMessages(dbMessages);
    
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
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      console.error('User auth error in POST /api/chat');
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = session.user.id;

    const {
      id: chatId,
      messages,
      selectedChatModel,
      data: requestData,
    }: {
      id: string;
      messages: Array<Message>;
      selectedChatModel: string;
      data?: { 
        activeDocumentId?: string | null;
        mentionedDocumentIds?: string[] | null;
        [key: string]: any; 
      }
    } = await request.json();

    console.log(`[Chat API POST] Received request for chatId: ${chatId}, selectedChatModel: ${selectedChatModel}`);

    const activeDocumentId = requestData?.activeDocumentId ?? undefined;
    const mentionedDocumentIds = requestData?.mentionedDocumentIds ?? undefined;

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(chatId)) {
      console.error(`[Chat API] Invalid chat ID format: ${chatId}`);
      return new Response('Invalid chat ID format', { status: 400 });
    }

    const chat = await getChatById({ id: chatId });

    if (!chat) {
      const title = await generateTitleFromUserMessage({ message: userMessage });
      await saveChat({
        id: chatId,
        userId: userId,
        title,
        document_context: {
          active: activeDocumentId,
          mentioned: mentionedDocumentIds
        }
      });
    } else {
      if (chat.userId !== userId) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      await updateChatContextQuery({ 
        chatId, 
        userId,
        context: {
          active: activeDocumentId,
          mentioned: mentionedDocumentIds
        }
      });
    }

    const userMessageBackendId = generateUUID();

    await saveMessages({
      messages: [{
        id: userMessageBackendId,
        chatId: chatId,
        role: userMessage.role,
        content: parseMessageContent(userMessage.content),
        createdAt: new Date().toISOString(),
      }],
    });

    const toolSession = session;
    if (!toolSession) {
      console.error('Failed to get session details needed for tools');
      return new Response('Internal Server Error', { status: 500 });
    }

    const enhancedSystemPrompt = await createEnhancedSystemPrompt({
      selectedChatModel,
      activeDocumentId,
      mentionedDocumentIds,
    });

    // Validate and load the active document once
    let validatedActiveDocumentId: string | undefined;
    let activeDoc: Document | null = null;
    if (activeDocumentId && uuidRegex.test(activeDocumentId)) {
        try {
        activeDoc = await getDocumentById({ id: activeDocumentId });
          if (activeDoc) {
            validatedActiveDocumentId = activeDocumentId;
          console.log(`[Chat API] Loaded active document: ${activeDoc.title}`);
          } else {
          console.warn(`[Chat API] Active document ID valid but not found: ${activeDocumentId}`);
        }
      } catch (error) {
        console.error(`[Chat API] Error loading active document ${activeDocumentId}:`, error);
      }
    }

    console.log(`[Chat API POST] Calling streamText with model: ${selectedChatModel}`);

    return createDataStreamResponse({
      execute: async (dataStream) => {
        // --- Build tools based on active document state ---
        const availableTools: any = {};
        const activeToolsList: Array<'createDocument' | 'streamingDocument' | 'updateDocument'> = [];

        if (!validatedActiveDocumentId) {
          // No active document: Only offer createDocument to make a new one.
          console.log('[Chat API] Offering tool: createDocument (no active document)');
          availableTools.createDocument = aiCreateDocument({ session: toolSession, dataStream });
          activeToolsList.push('createDocument');
        } else if ((activeDoc?.content?.length ?? 0) === 0) {
          // Active document exists but is empty: Only offer streamingDocument to fill it.
          console.log('[Chat API] Offering tool: streamingDocument (document is empty)');
          availableTools.streamingDocument = streamingDocument({ session: toolSession, dataStream });
          activeToolsList.push('streamingDocument');
        } else {
          // Active document exists and has content: Only offer updateDocument.
          console.log('[Chat API] Offering tool: updateDocument (document has content)');
          availableTools.updateDocument = updateDocument({ session: toolSession, documentId: validatedActiveDocumentId });
          activeToolsList.push('updateDocument');
        }
        // --- End Build tools ---

        // Regenerate the system prompt with the actual available tools
        const dynamicSystemPrompt = await createEnhancedSystemPrompt({
          selectedChatModel,
          activeDocumentId,
          mentionedDocumentIds,
          availableTools: activeToolsList,
        });

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: dynamicSystemPrompt,
          messages,
          maxSteps: activeToolsList.length,
          toolCallStreaming: true,
          experimental_activeTools: activeToolsList,
          experimental_generateMessageId: generateUUID,
          experimental_transform: smoothStream({
            chunking:'word',
          }),
          tools: availableTools, 
          onFinish: async ({ response, reasoning }) => {
            if (userId) {
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
                    content: parseMessageContent(message.content),
                    createdAt: new Date().toISOString(),
                  })),
                });
                
                await updateChatContextQuery({ 
                  chatId, 
                  userId,
                  context: {
                    active: activeDocumentId,
                    mentioned: mentionedDocumentIds
                  }
                });
              } catch (error) {
                console.error('Failed to save chat/messages onFinish:', error);
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
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      console.error('User auth error in DELETE /api/chat');
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const rawChatId = searchParams.get('id');

    if (!rawChatId) {
      return new Response('Chat ID is required', { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawChatId)) {
      return new Response('Invalid chat ID format', { status: 400 });
    }

    const chat = await getChatById({ id: rawChatId });

    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

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
