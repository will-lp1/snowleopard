"use client";
import React from 'react';
import { Markdown } from '@/components/markdown';
// blog.css removed: rely on global CSS and typography plugin

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

  const style: React.CSSProperties = accentColor
    ? ({ '--accent-color': accentColor } as any)
    : {};

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
        <Markdown>{content}</Markdown>
      </article>
    </main>
  );
}; 