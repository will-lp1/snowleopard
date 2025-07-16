import { tool, generateText } from 'ai';
import { Session } from '@/lib/auth';
import { z } from 'zod';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';
import { getGT } from 'gt-next/server';

interface UpdateDocumentProps {
  // Session is currently not used by this tool, but we keep it for future ACL needs.
  session: Session;
  documentId?: string;
}

export const updateDocument = ({ session: _session, documentId: defaultDocumentId }: UpdateDocumentProps) =>
  tool({
    description: 'Update a document based on a description. Returns the original and proposed new content for review.',
    parameters: z.object({
      description: z
        .string()
        .describe('The description of changes that need to be made'),
    }),
    execute: async ({ description }) => {
      const t = await getGT();
      const documentId = defaultDocumentId;

      try {
        // --- Validation ---
        if (!description.trim()) {
          return { error: t('No update description provided.') };
        }

        if (!documentId ||
            documentId === 'undefined' ||
            documentId === 'null' ||
            documentId.length < 32) {
          return { error: t('Invalid document ID: "{documentId}".', { documentId }) };
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(documentId)) {
          return { error: t('Invalid document ID format: "{documentId}".', { documentId }) };
        }

        // --- Fetch Document ---
        const document = await getDocumentById({ id: documentId });
        if (!document) {
          console.error(`[AI Tool] Document not found with ID: ${documentId}`);
          return { error: t('Document not found') };
        }
        const originalContent = document.content || '';

        // Generate full replacement content.  Encourage the model to perform the *smallest* possible change set so that our diff visualisation remains concise.
        const prompt = `You are an expert editor. Here is the ORIGINAL document:\n\n${originalContent}\n\n---\n\nTASK: Apply the following edits.\n- Make only the minimal changes required to satisfy the description.\n- Keep paragraphs, sentences, and words that do **not** need to change exactly as they are.\n- Do **not** paraphrase or re-flow content unless strictly necessary.\n- Preserve existing formatting and line breaks.\n\nReturn ONLY the updated document with no additional commentary.\n\nDESCRIPTION: "${description}"`;

        const { text: newContent } = await generateText({
          model: myProvider.languageModel('artifact-model'),
          prompt,
          // Asking for lower temperature for deterministic updates.
          temperature: 0.2,
        });

        // --- Return Result with Both Contents ---
        return {
          id: documentId,
          title: document.title,
          kind: document.kind,
          originalContent: originalContent, 
          newContent: newContent,           
          status: t('Update proposal generated.'),
        };

      } catch (error: any) {
        console.error('[AI Tool] updateDocument failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        // No dataStream to write to, just return error
        return {
          error: t('Failed to generate document update: {errorMessage}', { errorMessage }),
        };
      }
    },
  });
