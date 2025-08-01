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
import type { Document } from '@snow-leopard/db';
import { createDocument as aiCreateDocument } from '@/lib/ai/tools/create-document';
import { webSearch } from '@/lib/ai/tools/web-search';

export const maxDuration = 60;

async function createEnhancedSystemPrompt({
  selectedChatModel,
  activeDocumentId,
  mentionedDocumentIds,
  customInstructions,
  writingStyleSummary,
  applyStyle,
  availableTools = ['createDocument','streamingDocument','updateDocument','webSearch'] as Array<'createDocument'|'streamingDocument'|'updateDocument'|'webSearch'>,
}: {
  selectedChatModel: string;
  activeDocumentId?: string | null;
  mentionedDocumentIds?: string[] | null;
  customInstructions?: string | null;
  writingStyleSummary?: string | null;
  applyStyle?: boolean;
  availableTools?: Array<'createDocument'|'streamingDocument'|'updateDocument'|'webSearch'>;
}) {

  let basePrompt = systemPrompt({ selectedChatModel, availableTools });
  let contextAdded = false;

  if (customInstructions) {
    basePrompt = customInstructions + "\n\n" + basePrompt;
  }

  if (applyStyle && writingStyleSummary) {
    const styleBlock = `PERSONAL STYLE GUIDE\n• Emulate the author\'s tone, rhythm, sentence structure, vocabulary choice, and punctuation habits.\n• Do NOT copy phrases or introduce topics from the reference text.\n• Only transform wording to match style; keep semantic content from the current conversation.\nStyle description: ${writingStyleSummary}`;
    basePrompt = styleBlock + "\n\n" + basePrompt;
  }

  if (activeDocumentId) {
    try {
      const document = await getDocumentById({ id: activeDocumentId });
      if (document) {
        const documentContext = `
CURRENT DOCUMENT:
Title: ${document.title}
Content:
${document.content || '(Empty document)'}
`;
        basePrompt += `\n\n${documentContext}`;
        contextAdded = true;
      }
    } catch (error) {
    }
  }

  if (mentionedDocumentIds && mentionedDocumentIds.length > 0) {
    basePrompt += `\n\n--- MENTIONED DOCUMENTS (do not modify) ---`;
    for (const mentionedId of mentionedDocumentIds) {
      if (mentionedId === activeDocumentId) continue;

      try {
        const document = await getDocumentById({ id: mentionedId });
        if (document) {
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
      }
    }
    basePrompt += `\n--- END MENTIONED DOCUMENTS ---`;
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
      return new Response('Authentication error', { status: 401 });
    }
    
    const userId = session.user.id;

    const {
      id: chatId,
      messages,
      selectedChatModel,
      data: requestData,
      aiOptions,
    }: {
      id: string;
      messages: Array<Message>;
      selectedChatModel: string;
      data?: { 
        activeDocumentId?: string | null;
        mentionedDocumentIds?: string[] | null;
        [key: string]: any; 
      };
      aiOptions?: {
        customInstructions?: string | null;
        suggestionLength?: 'short' | 'medium' | 'long';
        writingStyleSummary?: string | null;
        applyStyle?: boolean;
      } | null;
    } = await request.json();

    const activeDocumentId = requestData?.activeDocumentId ?? undefined;
    const mentionedDocumentIds = requestData?.mentionedDocumentIds ?? undefined;
    const customInstructions = aiOptions?.customInstructions ?? null;
    const suggestionLength = aiOptions?.suggestionLength ?? 'medium';
    const writingStyleSummary = aiOptions?.writingStyleSummary ?? null;
    const applyStyle = aiOptions?.applyStyle ?? true;

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(chatId)) {
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
      return new Response('Internal Server Error', { status: 500 });
    }

    let validatedActiveDocumentId: string | undefined;
    let activeDoc: Document | null = null;
    if (activeDocumentId && uuidRegex.test(activeDocumentId)) {
        try {
        activeDoc = await getDocumentById({ id: activeDocumentId });
          if (activeDoc) {
            validatedActiveDocumentId = activeDocumentId;
          }
      } catch (error) {
        console.error(`Error loading active document ${activeDocumentId}:`, error);
      }
    }

    return createDataStreamResponse({
      execute: async (dataStream) => {
        const availableTools: any = {};
        const activeToolsList: Array<'createDocument' | 'streamingDocument' | 'updateDocument' | 'webSearch'> = [];

        if (!validatedActiveDocumentId) {
          availableTools.createDocument = aiCreateDocument({ session: toolSession, dataStream });
          availableTools.streamingDocument = streamingDocument({ session: toolSession, dataStream });
          activeToolsList.push('createDocument', 'streamingDocument');
        } else if ((activeDoc?.content?.length ?? 0) === 0) {
          availableTools.streamingDocument = streamingDocument({ session: toolSession, dataStream });
          activeToolsList.push('streamingDocument');
        } else {
          availableTools.updateDocument = updateDocument({ session: toolSession, documentId: validatedActiveDocumentId });
          activeToolsList.push('updateDocument');
        }

        if (process.env.TAVILY_API_KEY) {
          availableTools.webSearch = webSearch({ session: toolSession });
          activeToolsList.push('webSearch');
        }

        const dynamicSystemPrompt = await createEnhancedSystemPrompt({
          selectedChatModel,
          activeDocumentId,
          mentionedDocumentIds,
          customInstructions,
          writingStyleSummary,
          applyStyle,
          availableTools: activeToolsList,
        });

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: dynamicSystemPrompt,
          messages,
          maxSteps: 2,
          toolCallStreaming: true,
          experimental_activeTools: activeToolsList,
          experimental_generateMessageId: generateUUID,
          experimental_transform: smoothStream({
            chunking: 'word',
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
      onError: (error) => {
        console.error('Stream error:', error);
        return 'Sorry, something went wrong. Please try again.';
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
