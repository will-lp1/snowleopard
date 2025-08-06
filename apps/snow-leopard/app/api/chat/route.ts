import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  getDocumentById,
  updateChatContextQuery,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/api/chat/actions/chat';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { streamingDocument } from '@/lib/ai/tools/document-streaming';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';
import type { Document } from '@snow-leopard/db';
import { createDocument as aiCreateDocument } from '@/lib/ai/tools/create-document';
import { webSearch } from '@/lib/ai/tools/web-search';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';

export const maxDuration = 60;

// Schema validation
const postRequestBodySchema = {
  parse: (data: any) => {
    if (!data.id || !data.message) {
      throw new Error('Invalid request body');
    }
    return data;
  }
};

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

  if (customInstructions) {
    basePrompt = customInstructions + "\n\n" + basePrompt;
  }

  if (applyStyle && writingStyleSummary) {
    const styleBlock = `PERSONAL STYLE GUIDE\n• Emulate the author's tone, rhythm, sentence structure, vocabulary choice, and punctuation habits.\n• Do NOT copy phrases or introduce topics from the reference text.\n• Only transform wording to match style; keep semantic content from the current conversation.\nStyle description: ${writingStyleSummary}`;
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
      }
    } catch (error) {
      // Ignore document loading errors
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
        }
      } catch (error) {
        // Ignore document loading errors
      }
    }
    basePrompt += `\n--- END MENTIONED DOCUMENTS ---`;
  }
  
  return basePrompt;
}

export async function POST(request: Request) {
  let requestBody: any;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      data,
      aiOptions,
    } = requestBody;

    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userId = session.user.id;
    const activeDocumentId = data?.activeDocumentId ?? undefined;
    const mentionedDocumentIds = data?.mentionedDocumentIds ?? undefined;
    const customInstructions = aiOptions?.customInstructions ?? null;
    const writingStyleSummary = aiOptions?.writingStyleSummary ?? null;
    const applyStyle = aiOptions?.applyStyle ?? true;


    const messageCount = await getMessageCountByUserId({
      id: userId,
      differenceInHours: 24,
    });

    if (messageCount > 1000) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: userId,
        title,
        document_context: {
          active: activeDocumentId,
          mentioned: mentionedDocumentIds
        }
      });
    } else {
      if (chat.userId !== userId) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
      
      await updateChatContextQuery({ 
        chatId: id, 
        userId,
        context: {
          active: activeDocumentId,
          mentioned: mentionedDocumentIds
        }
      });
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          content: message.parts, // Store parts in content field for compatibility
          createdAt: new Date().toISOString(),
        },
      ],
    });

    let validatedActiveDocumentId: string | undefined;
    let activeDoc: Document | null = null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const availableTools: any = {};
        const activeToolsList: Array<'createDocument' | 'streamingDocument' | 'updateDocument' | 'webSearch'> = [];

        if (!validatedActiveDocumentId) {
          availableTools.createDocument = aiCreateDocument({ session });
          availableTools.streamingDocument = streamingDocument({ session, dataStream });
          activeToolsList.push('createDocument', 'streamingDocument');
        } else if ((activeDoc?.content?.length ?? 0) === 0) {
          availableTools.streamingDocument = streamingDocument({ session, dataStream });
          activeToolsList.push('streamingDocument');
        } else {
          availableTools.updateDocument = updateDocument({ session, documentId: validatedActiveDocumentId });
          activeToolsList.push('updateDocument');
        }

        if (process.env.TAVILY_API_KEY) {
          availableTools.webSearch = webSearch({ session });
          activeToolsList.push('webSearch');
        }

        const dynamicSystemPrompt = await createEnhancedSystemPrompt({
          selectedChatModel,
          activeDocumentId: validatedActiveDocumentId,
          mentionedDocumentIds,
          customInstructions,
          writingStyleSummary,
          applyStyle,
          availableTools: activeToolsList,
        });

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: dynamicSystemPrompt,
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools: activeToolsList,
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: availableTools,
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.parts, // Store parts in content field for compatibility
            createdAt: new Date().toISOString(),
            chatId: id,
          })),
        });
        
        await updateChatContextQuery({ 
          chatId: id, 
          userId,
          context: {
            active: activeDocumentId,
            mentioned: mentionedDocumentIds
          }
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Chat route error:', error);
    return new ChatSDKError('bad_request:chat').toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      return new ChatSDKError('not_found:chat').toResponse();
    }

    if (chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:chat').toResponse();
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return new ChatSDKError('bad_request:chat').toResponse();
  }
}