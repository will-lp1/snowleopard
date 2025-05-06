import {
  type Message as AIMessageType,
  createDataStreamResponse,
  streamText,
  smoothStream,
  experimental_createMCPClient,
  type MCPTransport,
  type CoreMessage
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

// Copied from scira-mcp-chat or mcp-context.tsx for backend use
interface KeyValuePair {
  key: string;
  value: string;
}

// This should match MCPServerApi from your mcp-context.tsx
interface MCPServerConfig {
  name?: string; 
  url: string;
  type: 'sse' | 'stdio';
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
}

/**
 * Creates an enhanced system prompt that includes active and mentioned document content
 */
async function createEnhancedSystemPrompt({
  selectedChatModel,
  activeDocumentId,
  mentionedDocumentIds,
  customInstructions,
  availableTools = [],
}: {
  selectedChatModel: string;
  activeDocumentId?: string | null;
  mentionedDocumentIds?: string[] | null;
  customInstructions?: string | null;
  availableTools?: string[];
}) {
  let basePrompt = systemPrompt({ selectedChatModel, availableTools: availableTools as any });
  let contextAdded = false;

  if (selectedChatModel === 'chat-model-reasoning') {
    basePrompt += "\n\nIMPORTANT: Think step-by-step about your plan using <think> tags before generating the response.";
  }

  if (customInstructions && customInstructions.trim() !== "") {
    basePrompt += `

USER'S CUSTOM INSTRUCTIONS:
${customInstructions}`;
    console.log('[Chat API] Added custom instructions to system prompt.');
  }

  console.log(`[createEnhancedSystemPrompt] Received model: ${selectedChatModel}, Tools: ${availableTools.join(', ')}`);
  
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
      } else {
        console.warn(`[Chat API] Active document not found for ID: ${activeDocumentId}`);
      }
    } catch (error) {
      console.error('[Chat API] Error fetching active document for context:', error);
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
        } else {
           console.warn(`[Chat API] Mentioned document not found for ID: ${mentionedId}`);
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
      id: chatIdFromRequest,
      messages,
      selectedChatModel,
      data: requestData,
      aiSettings,
      mcpServers = [],
    }: {
      id: string;
      messages: Array<AIMessageType>;
      selectedChatModel: string;
      data?: { 
        activeDocumentId?: string | null;
        mentionedDocumentIds?: string[] | null;
        [key: string]: any; 
      };
      aiSettings?: {
        customInstructions?: string | null;
      } | null;
      mcpServers?: MCPServerConfig[];
    } = await request.json();

    const chatId = chatIdFromRequest;

    console.log(`[Chat API POST] Received request for chatId: ${chatId}, selectedChatModel: ${selectedChatModel}`);
    console.log(`[Chat API POST] Received AI Settings:`, aiSettings);
    console.log(`[Chat API POST] Received MCP Servers:`, mcpServers.length);

    const activeDocumentId = requestData?.activeDocumentId ?? undefined;
    const mentionedDocumentIds = requestData?.mentionedDocumentIds ?? undefined;
    const customInstructions = aiSettings?.customInstructions ?? undefined;

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

    // --- Initialize MCP Clients and Discover Tools ---
    let combinedTools: any = {};
    const mcpClients: Array<{ close: () => Promise<void> }> = [];

    if (mcpServers && mcpServers.length > 0) {
      console.log(`[Chat API] Initializing ${mcpServers.length} MCP clients...`);
      for (const serverConfig of mcpServers) {
        try {
          let transport: MCPTransport; 
          if (serverConfig.type === 'sse') {
            const headers: Record<string, string> = {};
            if (serverConfig.headers) {
              serverConfig.headers.forEach(h => { if (h.key) headers[h.key] = h.value || ''; });
            }
            transport = {
              type: 'sse',
              url: serverConfig.url,
              headers: Object.keys(headers).length > 0 ? headers : undefined,
            };
          } else if (serverConfig.type === 'stdio') {
            // Ensure Experimental_StdioMCPTransport is imported and available if you support this
            // For now, let's log and skip to keep it simpler if not immediately needed.
            console.warn(`[Chat API] STDIO MCP transport for "${serverConfig.name || serverConfig.command}" is configured but might require 'ai/mcp-stdio'.`);
            // Example: transport = new Experimental_StdioMCPTransport({ command: serverConfig.command!, args: serverConfig.args!, env: ... });
            continue; // Skip STDIO for now if not fully set up with StdioMCPTransport
          } else {
            console.warn(`[Chat API] Unsupported MCP server type: ${serverConfig.type} for ${serverConfig.name || serverConfig.url}`);
            continue;
          }

          const mcpClient = await experimental_createMCPClient({ transport });
          mcpClients.push(mcpClient);
          const discoveredMcpTools = await mcpClient.tools();
          console.log(`[Chat API] Discovered tools from ${serverConfig.name || serverConfig.url}:`, Object.keys(discoveredMcpTools));
          combinedTools = { ...combinedTools, ...discoveredMcpTools };
        } catch (error) {
          console.error(`[Chat API] Failed to initialize MCP client for ${serverConfig.name || serverConfig.url}:`, error);
        }
      }
    }
    // --- End MCP Tool Initialization ---

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
        // --- Build existing tools based on active document state (your current logic) ---
        const activeToolsList: Array<'createDocument' | 'streamingDocument' | 'updateDocument'> = [];
        const documentSpecificTools: any = {};

        if (!validatedActiveDocumentId) {
          console.log('[Chat API] Offering tool: createDocument (no active document)');
          documentSpecificTools.createDocument = aiCreateDocument({ session: toolSession, dataStream });
          activeToolsList.push('createDocument');
        } else if ((activeDoc?.content?.length ?? 0) === 0) {
          console.log('[Chat API] Offering tool: streamingDocument (document is empty)');
          documentSpecificTools.streamingDocument = streamingDocument({ session: toolSession, dataStream });
          activeToolsList.push('streamingDocument');
        } else {
          console.log('[Chat API] Offering tool: updateDocument (document has content)');
          documentSpecificTools.updateDocument = updateDocument({ session: toolSession, documentId: validatedActiveDocumentId });
          activeToolsList.push('updateDocument');
        }
        // --- End Build existing tools ---

        // Merge document-specific tools with discovered MCP tools
        const allAvailableTools = { ...documentSpecificTools, ...combinedTools }; 

        // Regenerate the system prompt with the actual available tools (including MCP ones)
        // The availableTools in systemPrompt might need to accept a broader type or just be for logging purposes now
        const dynamicSystemPrompt = await createEnhancedSystemPrompt({
          selectedChatModel,
          activeDocumentId,
          mentionedDocumentIds,
          customInstructions,
          availableTools: [...activeToolsList, ...Object.keys(combinedTools)] as any,
        });

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: dynamicSystemPrompt,
          messages,
          maxSteps: 20,
          toolCallStreaming: true,
          experimental_activeTools: [...activeToolsList, ...Object.keys(combinedTools)],
          experimental_generateMessageId: generateUUID,
          experimental_transform: smoothStream({
            chunking:'word',
          }),
          tools: allAvailableTools,
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
                    toolInvocations: message.toolInvocations,
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
            // Close MCP clients after streaming is finished
            for (const client of mcpClients) {
              await client.close().catch(error => console.error('[Chat API] Error closing MCP client onFinish:', error));
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        // Add abort listener for request signal to close MCP clients
        request.signal.addEventListener('abort', async () => {
            console.log('[Chat API] Request aborted, closing MCP clients.');
            for (const client of mcpClients) {
                await client.close().catch(error => console.error('[Chat API] Error closing MCP client on abort:', error));
            }
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error) => {
        console.error('[Chat API] createDataStreamResponse error:', error);
        // Ensure mcpClients are closed here too, as a last resort if execute fails early
        for (const client of mcpClients) {
           client.close().catch(e => console.error('[Chat API] Error closing MCP client in outer onError:', e));
        }
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: (error as Error).message || String(error) }, { status: 400 });
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
