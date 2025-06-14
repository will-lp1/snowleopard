'use client';

import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Plus, X, ArrowUpIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;
    // Add user message
    const userMessage = { id: Date.now().toString(), role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    // Mock assistant response
    setTimeout(() => {
      const assistantMessage = { id: (Date.now() + 1).toString(), role: 'assistant' as const, content: 'This is a mock response. Wire up your AI backend here.' };
      setMessages(prev => [...prev, assistantMessage]);
    }, 500);
  };

  return (
    <>
      {/* Toggle Button */}
      {!open && (
        <div className="fixed bottom-4 right-4 z-50">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="dark:bg-sidebar border h-12 w-12 rounded-lg shadow-lg"
                  onClick={e => { e.stopPropagation(); setOpen(true); }}
                >
                  <img src="/black-icon.svg" alt="AI Assistant" width={22} height={22} className="block dark:hidden" />
                  <img src="/white-icon.svg" alt="AI Assistant" width={22} height={22} className="hidden dark:block" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle AI Assistant</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Chat Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Panel */}
          <div className="fixed bottom-4 right-4 z-50 w-[400px] h-[500px] bg-background rounded-2xl shadow-lg border border-border overflow-hidden">
            <div className="flex flex-col h-full overflow-hidden">

              {/* Header */}
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

              {/* Messages */}
              <div className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-auto pt-4">
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
                <div className="shrink-0 min-w-[24px] min-h-[24px]" />
              </div>

              {/* Input (cloned from multimodal-input.tsx) */}
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
                    {/* Send Button (exact spacing from multimodal-input) */}
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