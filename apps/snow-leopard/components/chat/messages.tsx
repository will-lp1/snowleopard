import { Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { Overview } from './overview';
import { memo, useState, useEffect } from 'react';
import equal from 'fast-deep-equal';
import { UseChatHelpers } from '@ai-sdk/react';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers['status'];
  messages: Array<Message>;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  isArtifactVisible: boolean;
}

function PureMessages({
  chatId,
  status,
  messages,
  setMessages,
  reload,
  isReadonly,
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  // Determine if the chat is actively processing or waiting for a response.
  const isActive = status === 'submitted' || status === 'streaming';
  const isReadyForInput = status === 'ready'; // Assuming 'ready' means completed and ready for new input

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-3 md:gap-4 lg:gap-6 flex-1 overflow-y-scroll pt-4 pb-4"
    >
      {/* Show overview only when chat is ready for input and there are no messages */}
      {messages.length === 0 && isReadyForInput && <Overview />} 

      {messages.map((message, index) => {
        const isLatest = index === messages.length - 1;
        return (
          <PreviewMessage
            key={message.id}
            chatId={chatId}
            message={message}
            isLoading={isActive} 
            isLatestMessage={isLatest && isActive} 
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
          />
        );
      })}

      {/* Show thinking indicator if actively waiting for a response and the last message was from user */}
      {isActive && 
        messages.length > 0 && 
        messages[messages.length - 1].role === 'user' && 
        <ThinkingMessage />}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[1px] min-h-[1px]"
      />
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible !== nextProps.isArtifactVisible) return false;
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  return true;
});
