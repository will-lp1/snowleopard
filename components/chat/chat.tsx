'use client';

import type { Attachment, Message, ChatRequestOptions } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat/chat-header';
import { fetcher, generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocumentContext } from '@/hooks/use-document-context';
import { MentionedDocument } from './multimodal-input';
import { FileIcon } from '../icons';
import { useArtifact } from '@/hooks/use-artifact';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';

export interface ChatProps {
  id?: string;
  initialMessages: Array<Message>;
  selectedChatModel?: string;
  isReadonly?: boolean;
}

export function Chat({
  id: initialId,
  initialMessages,
  selectedChatModel: initialSelectedChatModel,
  isReadonly = false,
}: ChatProps) {
  const { mutate } = useSWRConfig();
  const { documentId, documentTitle, documentContent } = useDocumentContext();
  const [documentContextActive, setDocumentContextActive] = useState(false);
  const { artifact } = useArtifact();
  const [chatId, setChatId] = useState(() => initialId || generateUUID());
  
  const [selectedChatModel, setSelectedChatModel] = useState(
    () => initialSelectedChatModel || DEFAULT_CHAT_MODEL
  );

  const [confirmedMentions, setConfirmedMentions] = useState<MentionedDocument[]>([]);

  useEffect(() => {
    const hasDocumentContext = documentId !== 'init' && documentContent;
    setDocumentContextActive(Boolean(hasDocumentContext));
    
    if (hasDocumentContext) {
      console.log('[Chat] Using document context in chat:', {
        documentId,
        title: documentTitle,
        contentLength: documentContent.length
      });
    }
  }, [documentId, documentContent, documentTitle]);

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
    data,
    error
  } = useChat({
    api: '/api/chat',
    id: chatId,
    initialMessages,
    body: {
      id: chatId,
      selectedChatModel: selectedChatModel,
    },
    onResponse: (res) => {
      if (res.status === 401) {
        console.error('Chat Unauthorized');
      }
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
    const handleLoadChat = async (event: CustomEvent<{ chatId: string }>) => {
      const detail = event.detail;
      
      if (!detail || !detail.chatId) return;
      
      try {
        const chatResponse = await fetch(`/api/chat?id=${detail.chatId}`);
        if (!chatResponse.ok) throw new Error('Failed to fetch chat');
        
        const chatData = await chatResponse.json();
        if (!chatData || !chatData.messages) {
          throw new Error('Invalid chat data received');
        }
        
        setMessages(chatData.messages);
        
        window.dispatchEvent(new CustomEvent('chat-id-changed', { 
          detail: { oldChatId: chatId, newChatId: detail.chatId }
        }));
        
        setInput('');

        console.log(`[Chat] Successfully loaded chat ${detail.chatId} with ${chatData.messages.length} messages`);
      } catch (error) {
        console.error('Error loading chat:', error);
        toast.error('Failed to load chat history');
      }
    };
    
    window.addEventListener('load-chat', handleLoadChat as unknown as EventListener);
    
    return () => {
      window.removeEventListener('load-chat', handleLoadChat as unknown as EventListener);
    };
  }, [chatId, setInput, setMessages]);

  useEffect(() => {
    const handleChatIdChanged = (event: CustomEvent<{ oldChatId: string, newChatId: string }>) => {
      const { oldChatId, newChatId } = event.detail;
      
      if (oldChatId === chatId) {
        console.log(`[Chat] Changing chat ID from ${oldChatId} to ${newChatId}`);
      }
    };
    
    window.addEventListener('chat-id-changed', handleChatIdChanged as unknown as EventListener);
    
    return () => {
      window.removeEventListener('chat-id-changed', handleChatIdChanged as unknown as EventListener);
    };
  }, [chatId]);

  useEffect(() => {
    const handleReset = () => {
      console.log('[Chat Component] Received reset-chat-state event');
      const newChatId = generateUUID();
      setMessages([]);
      setInput('');
      setChatId(newChatId);
      console.log('[Chat Component] Chat state reset. New ID:', newChatId);
    };

    window.addEventListener('reset-chat-state', handleReset);

    return () => {
      window.removeEventListener('reset-chat-state', handleReset);
    };
  }, [setMessages, setInput, setChatId]);

  const wrappedSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (documentContextActive && messages.length === initialMessages.length) {
      toast.success(`Using document context: ${documentTitle}`, {
        icon: <FileText className="size-4" />,
        duration: 3000,
        id: `doc-context-${documentId}`
      });
    }
    
    const contextData: { 
      activeDocumentId?: string | null;
      mentionedDocumentIds?: string[]; 
    } = {};
    
    const currentDocId = artifact.documentId;
    if (currentDocId && currentDocId !== 'init') {
      contextData.activeDocumentId = currentDocId;
    } else {
      contextData.activeDocumentId = null;
    }
    
    if (confirmedMentions.length > 0) {
      contextData.mentionedDocumentIds = confirmedMentions.map(doc => doc.id);
    }
    
    const options: ChatRequestOptions = {
      data: contextData,
    };

    handleSubmit(e, options);

    setConfirmedMentions([]);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChatHeader
        chatId={chatId}
        selectedModelId={selectedChatModel}
        isReadonly={isReadonly}
      />

      {documentContextActive && (
        <div className="px-3 py-1 text-xs text-muted-foreground text-center border-b subtle-border bg-muted/20">
          Active Document: <span className="font-medium text-foreground">{documentTitle}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <Messages
          chatId={chatId}
          status={status}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={false}
        />
      </div>

      {!isReadonly && (
        <div className="p-4 border-t subtle-border">
          
          <form onSubmit={wrappedSubmit}>
            <MultimodalInput
              chatId={chatId}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
              confirmedMentions={confirmedMentions}
              onMentionsChange={handleMentionsChange}
            />
          </form>
        </div>
      )}
    </div>
  );
}
