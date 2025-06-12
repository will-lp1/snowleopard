"use client";
import React from 'react';
import { Markdown } from '@/components/markdown';

export type ThemeOption = 'light' | 'dark' | 'minimal';
export type FontOption = 'sans' | 'serif' | 'mono';

interface BlogProps {
  title: string;
  content: string;
  theme?: ThemeOption;
  font?: FontOption;
  accentColor?: string;
}

export const Blog: React.FC<BlogProps> = ({
  title,
  content,
  theme = 'light',
  font = 'sans',
  accentColor,
}) => {
  const classMap: Record<ThemeOption, string> = {
    light: 'prose mx-auto py-10',
    dark: 'prose dark:prose-invert mx-auto py-10',
    minimal: 'max-w-3xl mx-auto py-10',
  };

  const fontMap: Record<FontOption, string> = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  };

  const style: React.CSSProperties = accentColor
    ? ({
        '--tw-prose-links': accentColor,
        '--tw-prose-headings': accentColor,
      } as any)
    : {};

  return (
    <article className={`${classMap[theme]} ${fontMap[font]}`} style={style}>
      <h1 className="font-bold text-3xl mb-4">{title}</h1>
      <Markdown>{content}</Markdown>
    </article>
  );
}; 