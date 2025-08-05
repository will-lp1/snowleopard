'use client';

import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import { DocumentToolCall, DocumentToolResult } from '@/components/chat/document';
import { PencilEditIcon, SparklesIcon, FileIcon } from '../icons';
import { Markdown } from '../markdown';
import { MessageActions } from './message-actions';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { MessageReasoning } from './message-reasoning';
import Image from 'next/image';

function formatMessageWithMentions(content: string) {
  if (!content) return content;
  
  const mentionRegex = /@([a-zA-Z0-9\s_-]+)/g;
  
  const parts = content.split(mentionRegex);
  
  if (parts.length <= 1) return content;
  
  const formattedContent = [];
  let i = 0;
  
  let match;
  let lastIndex = 0;
  const regex = new RegExp(mentionRegex);
  
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      formattedContent.push(content.substring(lastIndex, match.index));
    }
    
    const documentName = match[1];
    formattedContent.push(
      `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium">
        <span class="text-blue-500 dark:text-blue-400">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M14.5 13.5V6.5V5.41421C14.5 5.149 14.3946 4.89464 14.2071 4.70711L9.79289 0.292893C9.60536 0.105357 9.351 0 9.08579 0H8H3H1.5V1.5V13.5C1.5 14.8807 2.61929 16 4 16H12C13.3807 16 14.5 14.8807 14.5 13.5ZM13 13.5V6.5H9.5H8V5V1.5H3V13.5C3 14.0523 3.44772 14.5 4 14.5H12C12.5523 14.5 13 14.0523 13 13.5ZM9.5 5V2.12132L12.3787 5H9.5Z" fill="currentColor"/>
          </svg>
        </span>
        ${documentName}
      </span>`
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < content.length) {
    formattedContent.push(content.substring(lastIndex));
  }
  
  return formattedContent.join('');
}

const PurePreviewMessage = ({
  chatId,
  message,
  isLoading,
  setMessages,
  reload,
  isReadonly,
}: {
  chatId: string;
  message: Message;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) => {
  console.log('[PreviewMessage] Rendering message:', message);

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            'group-data-[role=user]/message:w-fit'
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center justify-center rounded-full ring-1 shrink-0 ring-border bg-background overflow-hidden relative">
              <Image
                src="/images/leopardprintbw.svg"
                alt="Snow Leopard"
                fill
                className="object-cover dark:invert"
                style={{ transform: 'scale(2.5)' }}
              />
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={message.reasoning}
              />
            )}

            {(message.content || message.reasoning) && (
              <div
                data-testid="message-content"
                className="flex flex-row gap-2 items-start"
              >
                <div
                  className={cn('flex flex-col gap-4', {
                    'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                      message.role === 'user',
                  })}
                >
                  {typeof message.content === 'string' ? (
                    <Markdown>{formatMessageWithMentions(message.content)}</Markdown>
                  ) : (
                    <pre className="text-sm text-red-500">
                      Error: Invalid message content format
                    </pre>
                  )}
                </div>
              </div>
            )}

            {message.toolInvocations && message.toolInvocations.length > 0 && (
              <div className="flex flex-col gap-4">
                {message.toolInvocations.map((toolInvocation) => {
                  const { toolName, toolCallId, state, args } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;
                    if (toolName === 'webSearch') {
                      const results = (result as any).results || [];
                      return (
                        <WebSearchResult key={toolCallId} query={(args as any).query} results={results} />
                      );
                    }
                    return (
                      <div key={toolCallId}>
                        {toolName === 'createDocument' ? (
                          <DocumentToolResult
                            type="create"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'streamingDocument' ? (
                          <DocumentToolResult
                            type="stream"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'updateDocument' ? (
                          <DocumentToolResult
                            type="update"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'requestSuggestions' ? (
                          <DocumentToolResult
                            type="request-suggestions"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : (
                          <pre>{JSON.stringify(result, null, 2)}</pre>
                        )}
                      </div>
                    );
                  }
                  if (state === 'call' && toolName === 'webSearch') {
                    return (
                      <div key={toolCallId} className="bg-background border rounded-xl w-full max-w-md p-3 text-sm animate-pulse">
                        Searching web for &quot;{(args as any).query}&quot;...
                      </div>
                    );
                  }

                  return (
                    <div
                      key={toolCallId}
                      className={cx({
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'createDocument' ? (
                        <DocumentToolCall
                          type="create"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'streamingDocument' ? (
                        <DocumentToolCall
                          type="stream"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.reasoning !== nextProps.message.reasoning)
      return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (
      !equal(
        prevProps.message.toolInvocations,
        nextProps.message.toolInvocations,
      )
    )
      return false;
    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center justify-center rounded-full ring-1 shrink-0 ring-border overflow-hidden relative">
          <Image
            src="/images/leopardprintbw.svg"
            alt="Snow Leopard"
            fill
            className="object-cover dark:invert"
            style={{ transform: 'scale(2.5)' }}
          />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Insert collapsible search result component
function WebSearchResult({ query, results }: { query: string; results: any[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-background border rounded-xl w-full max-w-md p-4 text-sm">
      <div className="flex items-center justify-between">
        <span>Search completed for &quot;{query}&quot;</span>
        <button onClick={() => setOpen(!open)} className="text-blue-600 hover:underline">
          {open ? 'Hide sources' : `View ${results.length} sources`}
        </button>
      </div>
      {open && (
        <ul className="list-disc pl-5 mt-2 space-y-1 max-h-60 overflow-auto">
          {results.map((item, idx) => (
            <li key={idx}>
              {item.title ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {item.title}
                </a>
              ) : (
                <span>{item.url}</span>
              )}
              {item.content && <span>: {item.content}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
