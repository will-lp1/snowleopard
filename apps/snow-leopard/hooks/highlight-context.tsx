'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface HighlightContextType {
  highlightedText: string | null;
  setHighlightedText: (text: string | null) => void;
}

const HighlightContext = createContext<HighlightContextType | undefined>(
  undefined,
);

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  return (
    <HighlightContext.Provider value={{ highlightedText, setHighlightedText }}>
      {children}
    </HighlightContext.Provider>
  );
}

export function useHighlight(): HighlightContextType {
  const context = useContext(HighlightContext);
  if (context === undefined) {
    throw new Error('useHighlight must be used within a HighlightProvider');
  }
  return context;
} 