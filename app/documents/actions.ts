'use server';

import { generateText, Message } from 'ai';
import { cookies } from 'next/headers';

import {
  getDocumentById,
  saveDocument,
} from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { createClient } from '@/lib/supabase/server';
import { ArtifactKind } from '@/components/artifact';

export async function generateDocumentTitleFromContent({
  content,
}: {
  content: string;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel('title-model'),
    system: `\n
    - you will generate a short title based on the content of a document
    - ensure it is not more than 80 characters long
    - the title should be a summary of the document content
    - do not use quotes or colons`,
    prompt: content,
  });

  return title;
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  // First get the existing document to preserve other fields
  const document = await getDocumentById({ id });
  
  // Then save it with updated content
  await saveDocument({
    id,
    title: document.title,
    kind: document.kind as ArtifactKind,
    content,
    userId: document.userId,
  });
} 