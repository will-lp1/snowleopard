import { notFound } from 'next/navigation';
import { db } from '@snow-leopard/db';
import * as schema from '@snow-leopard/db';
import { eq, and } from 'drizzle-orm';
import { Blog } from '@/components/blog';

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
  const theme = styleObj.theme as any;
  const font = styleObj.font as any;
  const accentColor = styleObj.accentColor as string;
  return (
    <Blog
      title={doc.title}
      content={doc.content || ''}
      theme={theme}
      font={font}
      accentColor={accentColor}
    />
  );
} 