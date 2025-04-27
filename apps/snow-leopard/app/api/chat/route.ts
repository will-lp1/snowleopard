import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
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
import { createDocument } from '@/lib/ai/tools/create-document';
import { isProductionEnvironment } from '@/lib/constants';
import { NextResponse } from 'next/server';
import { myProvider } from '@/lib/ai/providers';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';
import { ArtifactKind } from '@/components/artifact';
import type { Document } from '@snow-leopard/db';

export const maxDuration = 60;

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

    let validatedActiveDocumentId: string | undefined = undefined;
    let activeDocumentKind: ArtifactKind | undefined = undefined;

    if (activeDocumentId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(activeDocumentId)) {
        try {
          const activeDoc = await getDocumentById({ id: activeDocumentId });
          if (activeDoc) {
            validatedActiveDocumentId = activeDocumentId;
            activeDocumentKind = activeDoc.kind as ArtifactKind;
            console.log(`[Chat API] Validated active document ID: ${validatedActiveDocumentId}, Kind: ${activeDocumentKind}`);
          } else {
            console.warn(`[Chat API] Active document ${activeDocumentId} not found in DB.`);
          }
        } catch (error) {
          console.error(`[Chat API] Error fetching active document ${activeDocumentId} for kind:`, error);
        }
      } else {
        console.warn(`[Chat API] Invalid active document ID format, not passing to tools: ${activeDocumentId}`);
      }
    }

    console.log(`[Chat API POST] Calling streamText with model: ${selectedChatModel}`);

    return createDataStreamResponse({
      execute: async (dataStream) => {
        // --- Build tools dynamically (Re-refined) ---
        const availableTools: any = {};
        const activeToolsList: string[] = [];
        const MIN_CONTENT_LENGTH_FOR_UPDATE = 5; // Threshold

        // Only add tools if there IS an active document context
        if (validatedActiveDocumentId) { 
          let activeDoc: Document | null = null;
          let currentKind: ArtifactKind | undefined = undefined;

          // Fetch the active document within execute
          try {
            activeDoc = await getDocumentById({ id: validatedActiveDocumentId });
            if (activeDoc) {
              currentKind = activeDoc.kind as ArtifactKind;
            } else {
              console.warn(`[Chat API Execute] Active document ${validatedActiveDocumentId} not found when checking for tool selection.`);
            }
          } catch (error) {
            console.error('[Chat API Execute] Error fetching active document for tool selection:', error);
          }

          // Now, decide which tool to offer based on content
          if (activeDoc && currentKind) { // Ensure we found the doc and its kind
            const hasContent = activeDoc.content && activeDoc.content.length >= MIN_CONTENT_LENGTH_FOR_UPDATE;

            if (hasContent) {
              // Document has content -> Offer ONLY updateDocument
              availableTools.updateDocument = updateDocument({
                session: toolSession,
                documentId: validatedActiveDocumentId,
              });
              activeToolsList.push('updateDocument');
              console.log('[Chat API] Active document has content. Offering ONLY updateDocument tool.');
            } else {
              // Document is empty/minimal -> Offer ONLY createDocument
              availableTools.createDocument = createDocument({
                session: toolSession,
                dataStream,
                // No documentId/Kind needed for the tool itself anymore
              });
              activeToolsList.push('createDocument'); 
              console.log('[Chat API] Active document is empty/minimal. Offering ONLY createDocument tool.');
            }
          } else {
             console.log(`[Chat API] Could not find active document details (${validatedActiveDocumentId}) or kind, no document tools added.`);
          }

        } else {
          console.log('[Chat API] No active document ID, no document tools added.');
        }
        // --- End Build tools ---

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: enhancedSystemPrompt,
          messages,
          maxSteps: 5,
          experimental_activeTools: activeToolsList, 
          experimental_transform: smoothStream({ chunking: 'line' }),
          experimental_generateMessageId: generateUUID,
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
