"use client";
import React, { useMemo, useEffect } from 'react';
import { Markdown } from '@/components/markdown';
import { useHighlight } from '@/hooks/highlight-context';

export type FontOption = 'sans' | 'serif' | 'mono';

interface BlogProps {
  title: string;
  content: string;
  font?: FontOption;
  accentColor?: string;
  author?: string;
  date?: string;
}

export const Blog: React.FC<BlogProps> = ({
  title,
  content,
  font = 'sans',
  accentColor,
  author,
  date,
}) => {
  const fontClass = `font-${font}`;
  const { highlightedText } = useHighlight();

  const style: React.CSSProperties = accentColor
    ? ({ '--accent-color': accentColor } as any)
    : {};

  const processedContent = useMemo(() => {
    if (!highlightedText || !content.includes(highlightedText)) {
      return content;
    }
    return content.replace(
      highlightedText,
      `<mark id="highlighted-text" class="bg-yellow-300/25 dark:bg-yellow-300/50 transition-colors duration-300 ease-in-out rounded px-1 py-0.5">${highlightedText}</mark>`,
    );
  }, [content, highlightedText]);

  useEffect(() => {
    if (highlightedText) {
      const element = document.getElementById('highlighted-text');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedText]);

  return (
    <main className="min-h-screen bg-background text-foreground" style={style}>
      <article className={`prose dark:prose-invert mx-auto py-16 px-4 sm:px-6 lg:px-8 ${fontClass}`}>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter mb-8">{title}</h1>
        {(author || date) && (
          <div className="text-sm mb-6 flex items-center space-x-2 text-muted-foreground">
            {author && <span>By <strong>{author}</strong></span>}
            {date && <span>{date}</span>}
          </div>
        )}
        <Markdown>{processedContent}</Markdown>
      </article>
    </main>
  );
}; 