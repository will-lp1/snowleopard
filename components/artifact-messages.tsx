import { PreviewMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Message } from 'ai';
import { memo } from 'react';
import equal from 'fast-deep-equal';
import { UIArtifact } from './artifact';
import { UseChatHelpers } from '@ai-sdk/react';

interface ArtifactMessagesProps {
  chatId: string;
  status: UseChatHelpers['status'];
  messages: Array<Message>;
  setMessages: UseChatHelpers['setMessages'];
  reload: UseChatHelpers['reload'];
  isReadonly: boolean;
  artifactStatus: UIArtifact['status'];
}

function PureArtifactMessages({
  chatId,
  status,
  messages,
  setMessages,
  reload,
  isReadonly,
}: ArtifactMessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col pt-4 gap-6 flex-1 overflow-y-auto min-w-0"
    >
      {messages.map((message, index) => (
        <PreviewMessage
          key={message.id}
          chatId={chatId}
          message={message}
          isLoading={status === 'streaming' && messages.length - 1 === index}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

function areEqual(
  prevProps: ArtifactMessagesProps,
  nextProps: ArtifactMessagesProps,
) {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  if (prevProps.artifactStatus !== nextProps.artifactStatus) return false;
  return true;
}

export const ArtifactMessages = memo(PureArtifactMessages, areEqual);
