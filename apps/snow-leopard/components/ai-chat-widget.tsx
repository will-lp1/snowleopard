'use client';

import { useState, useEffect } from 'react';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Plus, X, ArrowUpIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface AIChatWidgetProps {
  context: string;
}

export default function AIChatWidget({ context }: AIChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    const newMessage = { id: Date.now().toString(), role: 'user' as const, content: input };
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    const conversation = [...messages, newMessage];
    const res = await fetch('/api/blog-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversation, context }),
    });
    if (!res.ok) {
      console.error(await res.text());
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let done = false;
    const assistantId = Date.now().toString() + '-assistant';
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant' as const, content: '' }]);
    while (!done) {
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
    }
  };

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, open]);

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            className="rounded-full px-6 py-3 shadow-lg"
            onClick={e => { e.stopPropagation(); setOpen(true); }}
          >
            Ask Leo
          </Button>
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-4 right-4 z-50 w-[400px] h-[500px] bg-background rounded-2xl shadow-lg border border-border overflow-hidden">
            <div className="flex flex-col h-full overflow-hidden">

              <header className="flex sticky top-0 bg-background/80 backdrop-blur-sm z-10 border-b border-border items-center px-3 h-[45px] gap-2 transition-all duration-200">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={handleNewChat}
                  title="New Chat"
                >
                  <Plus className="size-4" />
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setOpen(false)}
                  title="Close Chat"
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
                            alt="Snow Leopard"
                            className="object-cover dark:invert"
                          />
                        </div>
                      )}
                      <div className="flex flex-col gap-4 w-full">
                        <div data-testid="message-content" className="flex flex-row gap-2 items-start">
                          <div className={message.role === 'user' ? 'bg-primary text-primary-foreground px-3 py-2 rounded-xl' : ''}>
                            {message.content}
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
                      placeholder="Send a message..."
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
                        disabled={!input.trim()}
                      >
                        <ArrowUpIcon size={14} />
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
} 