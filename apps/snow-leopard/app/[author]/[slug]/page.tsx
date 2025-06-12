import { notFound } from 'next/navigation';
import { db } from '@snow-leopard/db';
import * as schema from '@snow-leopard/db';
import { eq, and } from 'drizzle-orm';
import { Markdown } from '@/components/markdown';

export default async function Page({ params }: any) {
  const { author, slug } = await params;
  const result = await db
    .select()
    .from(schema.Document)
    .where(
      and(
        eq(schema.Document.author, author),
        eq(schema.Document.slug, slug),
        eq(schema.Document.visibility, 'public')
      )
    )
    .limit(1);
  const doc = result[0];
  if (!doc) {
    notFound();
  }
  // Extract custom styles
  const styleObj = (doc.style as any) || {};
  const theme = styleObj.theme as string;
  const font = styleObj.font as string;
  const accentColor = styleObj.accentColor as string;
  // Base tailwind typography classes per theme
  const classMap: Record<string, string> = {
    light: 'prose mx-auto py-10',
    dark: 'prose dark:prose-invert mx-auto py-10',
    minimal: 'max-w-2xl mx-auto py-10',
  };
  // Font family map
  const fontMap: Record<string, string> = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  };
  // Compose wrapper class and inline style for accent color
  const wrapperClass = `${classMap[theme] || classMap.light} ${fontMap[font] || ''}`;
  const wrapperStyle = accentColor
    ? ({ '--tw-prose-links': accentColor } as any)
    : {};
  return (
    <div className={wrapperClass} style={wrapperStyle}>
      <h1 className="text-3xl font-bold mb-4">{doc.title}</h1>
      <Markdown>{doc.content || ''}</Markdown>
    </div>
  );
} 