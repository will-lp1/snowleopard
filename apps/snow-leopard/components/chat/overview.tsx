import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { FileText, PenLine, MessageSquare } from 'lucide-react';
import { T } from 'gt-next';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="size-full flex items-center justify-center p-6"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.3 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-4 leading-relaxed text-center max-w-md bg-card/50 border shadow-sm dark:border-white/10">
        
        <T>
          <h2 className="text-xl font-medium">Welcome to Snow Leopard</h2>
        </T>
        
        <T>
          <p className="text-sm text-muted-foreground">
            A modern writing tool designed to enhance your creative process. 
            Write, edit, and collaborate with AI assistance - all in one integrated environment.
          </p>
        </T>
        
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <T>
            <p>Press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-background border border-border rounded-md">TAB</kbd> to generate a suggestion.</p>
          </T>
          <T>
            <p>Highlight text and press <kbd className="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-background border border-border rounded-md">⌘/Ctrl + K</kbd> to edit.</p>
          </T>
          <T>
            <p>Send a message in the chat input below.</p>
          </T>
          <T>
            <p>Hold <kbd className="px-1.5 py-0.5 text-xs font-semibold text-foreground bg-background border border-border rounded-md">Shift</kbd> and hover over text for synonyms.</p>
          </T>
          <T>
            <p>Configure AI behavior in the settings menu (top-right).</p>
          </T>
        </div>

          <Button
            variant="ghost"
            className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            asChild
          >
            <Link href="https://discord.gg/TwG73aHE" target="_blank" rel="noopener noreferrer">
              <Image src="/images/discord-logo.png" alt="Discord" width={16} height={16} />
              <T>Join the Discord</T>
            </Link>
          </Button>
        </div>
    </motion.div>
  );
};
