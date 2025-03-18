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

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  // Custom submit handler wrapped to match signature
  const wrappedSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Show toast when document context is active
    if (documentContextActive) {
      toast.success(`Using document "${artifact.title}" as context`, {
        icon: <FileText className="size-4" />
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

      {/* Document context indicator */}
      {documentContextActive && (
        <div className="px-4 py-2 bg-primary/5 border-b flex items-center gap-2">
          <FileText className="size-4 text-primary" />
          <span className="text-sm flex-1">
            Using document: <strong>{artifact.title}</strong>
            <span className="ml-2 text-xs text-muted-foreground">
              ({artifact.content.length > 0 ? `${Math.min(artifact.content.length, 9999)} chars` : 'Empty document'})
            </span>
          </span>
          <div className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
            <span className="size-2 bg-green-500 rounded-full animate-pulse"></span>
            Document Context Active
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
