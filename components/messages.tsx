import { Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
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

  // Add effect to process message content for artifact update events
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Check the last message for tool data
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant') {
      try {
        // Parse the message content to look for tool data
        let content;
        
        if (typeof lastMessage.content === 'string') {
          try {
            content = JSON.parse(lastMessage.content);
          } catch (e) {
            // Not valid JSON, skip processing
            return;
          }
        } else {
          content = lastMessage.content;
        }
        
        if (content && Array.isArray(content) && content.length > 0) {
          // Scan for artifactUpdate data in the message
          content.forEach(item => {
            if (item && typeof item === 'object' && item.type === 'artifactUpdate') {
              console.log('[Messages] Found artifactUpdate data in message, dispatching to editor');
              
              // Dispatch the data to the editor
              if (typeof window !== 'undefined') {
                try {
                  const event = new CustomEvent('editor:stream-data', {
                    detail: item
                  });
                  window.dispatchEvent(event);
                } catch (err) {
                  console.error('[Messages] Error dispatching editor event:', err);
                }
              }
            }
          });
        }
      } catch (error) {
        // Not JSON or doesn't have the expected structure, which is fine
        console.log('[Messages] Non-critical error parsing message content:', error);
      }
    }
  }, [messages]);

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
    >
      {messages.length === 0 && <Overview />}

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

      {status === 'submitted' &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isArtifactVisible && nextProps.isArtifactVisible) return true;

  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.status && nextProps.status) return false;
  if (prevProps.messages.length !== nextProps.messages.length) return false;
  if (!equal(prevProps.messages, nextProps.messages)) return false;
  return true;
});
