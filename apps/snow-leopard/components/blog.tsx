"use client";
import React from 'react';
import { Markdown } from '@/components/markdown';
import '../app/blog.css'; // Import the new styles

export type ThemeOption = 'light' | 'dark' | 'minimal';
export type FontOption = 'sans' | 'serif' | 'mono';

interface BlogProps {
  title: string;
  content: string;
  theme?: ThemeOption;
  font?: FontOption;
  accentColor?: string;
  author?: string;
  date?: string;
}

export const Blog: React.FC<BlogProps> = ({
  title,
  content,
  theme = 'light',
  font = 'sans',
  accentColor,
  author,
  date,
}) => {
  const themeClass = `theme-${theme}`;
  const fontClass = `font-${font}`;

  const style: React.CSSProperties = accentColor
    ? ({ '--accent-color': accentColor } as any)
    : {};

  return (
    <main className={`blog-theme ${themeClass}`} style={style}>
      <article className={`blog-article ${fontClass}`}>
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter mb-8">{title}</h1>
        {(author || date) && (
          <div className="blog-meta">
            {author && <span>By <strong>{author}</strong></span>}
            {date && <span>{new Date(date).toLocaleDateString()}</span>}
          </div>
        )}
        <Markdown>{content}</Markdown>
      </article>
    </main>
  );
}; 