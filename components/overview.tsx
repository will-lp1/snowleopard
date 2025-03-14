import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, PenLine, MessageSquare } from 'lucide-react';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="w-full h-full flex items-center justify-center p-6"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.3 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl bg-card/50 border border-border/40 shadow-sm">
        <div className="flex flex-row justify-center gap-8 items-center">
          <FileText size={28} className="text-primary/80" />
          <PenLine size={28} className="text-primary/80" />
          <MessageSquare size={28} className="text-primary/80" />
        </div>
        
        <h2 className="text-xl font-medium">Welcome to Cursor for Writing</h2>
        
        <p className="text-muted-foreground">
          A modern, artifact-centered writing tool designed to enhance your creative process. 
          Write, edit, and collaborate with AI assistance - all in one integrated environment.
        </p>
        
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            This is an{' '}
            <Link
              className="font-medium underline underline-offset-4 text-primary"
              href="https://github.com/will-lp1/cursorforwriting"
              target="_blank"
            >
              open source
            </Link>{' '}
            project built with Next.js, Vercel AI SDK, and Groq inference.
          </p>
          
          <p className="text-sm text-muted-foreground">
            Get started by creating a new document or selecting an existing one from the sidebar.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
