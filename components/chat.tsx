'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import { fetcher, generateUUID } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import { VisibilityType } from './visibility-selector';
import { toast } from 'sonner';
import { useArtifact } from '@/hooks/use-artifact';
import { FileText } from 'lucide-react';

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
  const hasShownContextToastRef = useRef(false);

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

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  // Custom submit handler wrapped to match signature
  const wrappedSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Show toast when document context is active, but only once per session
    if (documentContextActive && !hasShownContextToastRef.current) {
      toast.success(`Using document "${artifact.title}" as context`, {
        icon: <FileText className="size-4" />,
        id: 'document-context-active', // Use ID to prevent duplicate toasts
        duration: 3000
      });
      hasShownContextToastRef.current = true;
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

      {/* Document context subtle indicator */}
      {documentContextActive && (
        <div className="flex items-center px-4 py-1 border-b bg-muted/20">
          <div className="flex items-center text-xs text-muted-foreground">
            <FileText className="size-3 mr-1 text-primary/70" />
            <span className="mr-1">Context:</span>
            <span className="font-medium text-primary/80 truncate max-w-[200px]">{artifact.title}</span>
            <span className="size-1.5 mx-1.5 bg-green-500 rounded-full"></span>
            <span className="text-primary/70 text-xs">AI can see this document</span>
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
