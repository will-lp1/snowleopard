'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import { fetcher, generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { toast } from 'sonner';
import { useArtifact } from '@/hooks/use-artifact';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();
  const { artifact } = useArtifact();
  const [documentContextActive, setDocumentContextActive] = useState(false);

  // Update document context status when artifact changes
  useEffect(() => {
    const hasDocumentContext = artifact.documentId !== 'init' && artifact.content;
    setDocumentContextActive(Boolean(hasDocumentContext));
    
    if (hasDocumentContext) {
      console.log('[Chat] Using document context in chat:', {
        documentId: artifact.documentId,
        title: artifact.title,
        contentLength: artifact.content.length
      });
    }
  }, [artifact.documentId, artifact.content, artifact.title]);

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
  } = useChat({
    id,
    body: { 
      id, 
      selectedChatModel,
      // Pass the document ID to the API with additional logging for debugging
      documentId: artifact.documentId !== 'init' ? artifact.documentId : null,
    },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      mutate('/api/history');
    },
    onError: () => {
      toast.error('An error occurred, please try again!');
    },
  });

  // Ensure chat context updates when document changes
  useEffect(() => {
    if (status !== 'streaming') {
      console.log('[Chat] Document context updated, resetting chat state');
    }
  }, [artifact.documentId, status]);

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  // Custom submit handler wrapped to match signature
  const wrappedSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Show toast only on first message in a session with document context
    if (documentContextActive && messages.length === initialMessages.length) {
      toast.success(`Using document context: ${artifact.title}`, {
        icon: <FileText className="size-4" />,
        duration: 3000,
        id: `doc-context-${artifact.documentId}` // Prevent duplicate toasts
      });
    }
    
    handleSubmit();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ChatHeader
        chatId={id}
        selectedModelId={selectedChatModel}
        selectedVisibilityType={selectedVisibilityType}
        isReadonly={isReadonly}
      />

      {/* Simplified Document context indicator */}
      {documentContextActive && (
        <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground border-b bg-muted/20">
          <FileText className="size-3.5 text-primary" />
          <span className="flex-1 truncate">
            Using <span className="font-medium text-primary">{artifact.title}</span>
          </span>
          <div className="flex items-center gap-1">
            <span className="size-1.5 bg-green-500 rounded-full"></span>
            <span className="text-primary text-[10px] font-medium uppercase tracking-wide">Active</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <Messages
          chatId={id}
          status={status}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isArtifactVisible={false}
        />
      </div>

      {!isReadonly && (
        <div className="p-4 border-t border-border">
          <form onSubmit={wrappedSubmit}>
            <MultimodalInput
              chatId={id}
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
            />
          </form>
        </div>
      )}
    </div>
  );
}
