'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { fetchWithErrorHandlers } from '@/lib/utils';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useState, useEffect } from 'react';
import { ChatHeader } from '@/components/chat/chat-header';
import { generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { toast } from 'sonner';
import { useDocumentContext } from '@/hooks/use-document-context';
import { MentionedDocument } from './multimodal-input';
import { useArtifact } from '@/hooks/use-artifact';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { useAiOptionsValue } from '@/hooks/ai-options';
import { useDataStream } from '@/components/data-stream-provider';

export interface ChatProps {
  id?: string;
  initialMessages: Array<ChatMessage>;
  selectedChatModel?: string;
  isReadonly?: boolean;
}

export function Chat({
  id: initialId,
  initialMessages,
  selectedChatModel: initialSelectedChatModel,
  isReadonly = false,
}: ChatProps) {
  const { documentId, documentTitle, documentContent } = useDocumentContext();
  const [documentContextActive, setDocumentContextActive] = useState(false);

  const { artifact } = useArtifact();
  const { writingStyleSummary, applyStyle } = useAiOptionsValue();
  const [chatId, setChatId] = useState(() => initialId || generateUUID());
  
  const [selectedChatModel, setSelectedChatModel] = useState(
    () => initialSelectedChatModel || DEFAULT_CHAT_MODEL
  );
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [requestedChatLoadId, setRequestedChatLoadId] = useState<string | null>(null);

  const handleModelChange = (newModelId: string) => {
    setSelectedChatModel(newModelId);
  };

  const [confirmedMentions, setConfirmedMentions] = useState<MentionedDocument[]>([]);

  useEffect(() => {
    const hasDocumentContext = documentId !== 'init';
    setDocumentContextActive(Boolean(hasDocumentContext));
    
  }, [documentId, documentContent, documentTitle]);

  const [input, setInput] = useState<string>('');
  const { setDataStream } = useDataStream();

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    error
  } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            selectedChatModel: selectedChatModel,
            data: {
              activeDocumentId: documentId !== 'init' ? documentId :
                (typeof window !== 'undefined' && window.location.pathname.startsWith('/documents/'))
                  ? window.location.pathname.split('/')[2]
                  : documentId,
              mentionedDocumentIds: confirmedMentions.map(m => m.id),
            },
            aiOptions: {
              writingStyleSummary,
              applyStyle,
            },
            ...body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : [dataPart]));
    },
    onError: (err) => {
      console.error('Chat Error:', err);
    },
  });

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const handleMentionsChange = (mentions: MentionedDocument[]) => {
    setConfirmedMentions(mentions);
  };

  useEffect(() => {
    const handleResetChatInput = (event: CustomEvent) => {
      const detail = event.detail as { chatId: string } | undefined;
      
      if (detail && detail.chatId === chatId) {
        setInput('');
        if (messages.length > initialMessages.length) {
          setMessages(initialMessages);
        }
      }
    };

    window.addEventListener('reset-chat-input', handleResetChatInput as EventListener);
    
    return () => {
      window.removeEventListener('reset-chat-input', handleResetChatInput as EventListener);
    };
  }, [chatId, initialMessages, setInput, messages, setMessages]);

  useEffect(() => {
    const loadHistory = async (idToLoad: string) => {
      setIsLoadingChat(true);
      try {
        setRequestedChatLoadId(null);
        const chatResponse = await fetch(`/api/chat?id=${idToLoad}`);
        
        if (!chatResponse.ok) {
          throw new Error('Failed to fetch chat');
        }

        const chatData = await chatResponse.json();
        if (!chatData?.messages) {
          throw new Error('Invalid chat data');
        }

        setInput('');
        setMessages(chatData.messages);
      } catch (error) {
        toast.error('Failed to load chat history');
        setMessages(initialMessages);
        setInput('');
      } finally {
        setIsLoadingChat(false);
      }
    };

    if (requestedChatLoadId) {
      loadHistory(requestedChatLoadId);
    }
  }, [requestedChatLoadId, setMessages, setInput, initialMessages]);

  useEffect(() => {
    const handleLoadChatEvent = (event: CustomEvent<{ chatId: string }>) => {
      const detail = event.detail;
      if (!detail || !detail.chatId) return;

      if (detail.chatId !== chatId) {
        setChatId(detail.chatId);
        setRequestedChatLoadId(detail.chatId);
      }
    };

    window.addEventListener('load-chat', handleLoadChatEvent as unknown as EventListener);

    return () => {
      window.removeEventListener('load-chat', handleLoadChatEvent as unknown as EventListener);
    };
  }, [chatId]);

  useEffect(() => {
    const handleChatIdChanged = (event: CustomEvent<{ oldChatId: string, newChatId: string }>) => {
      const { oldChatId, newChatId } = event.detail;
      
    };
    
    window.addEventListener('chat-id-changed', handleChatIdChanged as unknown as EventListener);
    
    return () => {
      window.removeEventListener('chat-id-changed', handleChatIdChanged as unknown as EventListener);
    };
  }, [chatId]);

  useEffect(() => {
    const handleReset = () => {
      const newChatId = generateUUID();
      setMessages([]);
      setInput('');
      setChatId(newChatId);
    };

    window.addEventListener('reset-chat-state', handleReset);

    return () => {
      window.removeEventListener('reset-chat-state', handleReset);
    };
  }, [setMessages, setInput, setChatId]);


  return (
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={chatId}
          selectedModelId={selectedChatModel}
          onModelChange={handleModelChange}
          isReadonly={isReadonly}
        />

        <Messages
          chatId={chatId}
          status={status}
          messages={messages}
          setMessages={setMessages}
          regenerate={regenerate}
          requiresScrollPadding={false}
          isArtifactVisible={false}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={chatId}
              input={input}
              setInput={setInput}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              sendMessage={sendMessage}
              confirmedMentions={confirmedMentions}
              onMentionsChange={handleMentionsChange}
            />
          )}
        </form>
              </div>
  );
}


