import { notFound } from 'next/navigation';
import { db } from '@snow-leopard/db';
import * as schema from '@snow-leopard/db';
import { eq, and } from 'drizzle-orm';
import { Markdown } from '@/components/markdown';

interface PageProps {
  params: { author: string; slug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function Page({ params }: PageProps) {
  const result = await db
    .select()
    .from(schema.Document)
    .where(
      and(
        eq(schema.Document.author, params.author),
        eq(schema.Document.slug, params.slug),
        eq(schema.Document.visibility, 'public')
      )
    )
    .limit(1);
  const doc = result[0];
  if (!doc) {
    notFound();
  }
  const theme = (doc.style as any)?.theme;
  const classMap: Record<string, string> = {
    light: 'prose mx-auto py-10',
    dark: 'prose dark:prose-invert mx-auto py-10',
    minimal: 'max-w-2xl mx-auto py-10',
  };
  return (
    <div className={classMap[theme] || classMap.light}>
      <h1 className="text-3xl font-bold mb-4">{doc.title}</h1>
      <Markdown>{doc.content || ''}</Markdown>
    </div>
  );
} 