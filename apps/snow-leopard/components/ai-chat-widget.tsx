'use client';

import { useState, useEffect, useRef } from 'react';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, X, ArrowUpIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {Markdown} from '@/components/markdown';
import { T, useGT } from 'gt-next';

interface AIChatWidgetProps {
  context: string;
  title: string;
  author: string;
  date: string;
}

export default function AIChatWidget({ context, title, author, date }: AIChatWidgetProps) {
  const t = useGT();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setInput('');
    setError(null);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setError(null);
    setLoading(true);
    // abort any previous
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const userMessage = { id: Date.now().toString(), role: 'user' as const, content: input };
    // Build next messages array and use for conversation
    const nextMessages = [...messagesRef.current, userMessage];
    setMessages(nextMessages);
    setInput('');
    const conversation = nextMessages;
    let res: Response;
    try {
      res = await fetch('/api/blog-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation, context, title, author, date }),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setError(t('Network error'));
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      console.error(text);
      setError(t('Failed to load AI response'));
      setLoading(false);
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      setLoading(false);
      return;
    }
    const decoder = new TextDecoder();
    let done = false;
    const assistantId = Date.now().toString() + '-assistant';
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant' as const, content: '' }]);
    while (!done) {
      try {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value);
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error(err);
        break;
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, open]);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="fixed bottom-4 right-4 z-50"
          >
            <Button
              className="rounded-full px-6 py-3 shadow-lg" 
              onClick={e => { e.stopPropagation(); setOpen(true); }}
            >
              {t("Ask Leo")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="fixed bottom-4 right-4 z-50 w-[400px] h-[500px] bg-background rounded-2xl shadow-lg border border-border overflow-hidden"
            >
              <div className="flex flex-col h-full overflow-hidden">

                <header className="flex sticky top-0 bg-background/80 backdrop-blur-sm z-10 border-b border-border items-center px-3 h-[45px] gap-2 transition-all duration-200">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={handleNewChat}
                    title={t("New Chat")}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => setOpen(false)}
                    title={t("Close Chat")}
                  >
                    <X className="size-4" />
                  </Button>
                </header>

                <div ref={messagesContainerRef} className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4">
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className="w-full mx-auto max-w-3xl px-4 group/message"
                      data-role={message.role}
                    >
                      <div className="flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:w-fit">
                        {message.role === 'assistant' && (
                          <div className="size-8 flex items-center justify-center rounded-full ring-1 shrink-0 ring-border bg-background overflow-hidden relative">
                            <img
                              src="/images/leopardprintbw.svg"
                              alt={t("Snow Leopard")}
                              className="object-cover dark:invert"
                            />
                          </div>
                        )}
                        <div className="flex flex-col gap-4 w-full">
                          <div data-testid="message-content" className="flex flex-row gap-2 items-start">
                            <div className={message.role === 'user' ? 'bg-primary text-primary-foreground px-3 py-2 rounded-xl' : ''}>
                              <Markdown>
                              {message.content}
                              </Markdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]" />
                </div>

                <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 relative">
                  <form onSubmit={handleSubmit}>
                    <div className="relative w-full flex flex-col gap-4">
                      <Textarea
                        data-testid="multimodal-input"
                        placeholder={t("Send a message...")}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        className="px-3 py-2 min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700"
                        rows={2}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e as any);
                          }
                        }}
                      />
                      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
                        <Button
                          type="submit"
                          data-testid="send-button"
                          className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
                          disabled={!input.trim() || loading}
                        >
                          <ArrowUpIcon size={14} />
                        </Button>
                      </div>
                    </div>
                  </form>
                  {error && <div className="text-xs text-destructive text-center mb-2">{error}</div>}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
} 