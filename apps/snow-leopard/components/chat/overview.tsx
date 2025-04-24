import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText, PenLine, MessageSquare } from 'lucide-react';

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
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl bg-card/50 border shadow-sm dark:border-white/10">

        
        <h2 className="text-xl font-medium">Welcome to Snow Leopard</h2>
        
        <p className="text-muted-foreground">
          A modern, writing tool designed to enhance your creative process. 
          Write, edit, and collaborate with AI assistance - all in one integrated environment.
        </p>
        
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
          Press TAB to generate a suggestion

          Or highlight text and press CMD/CTRL + K to generate a suggestion

          Or send a message here
          </p>
          
          <p className="text-sm text-muted-foreground">
            Get started by creating a new document or selecting an existing one from the sidebar.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
