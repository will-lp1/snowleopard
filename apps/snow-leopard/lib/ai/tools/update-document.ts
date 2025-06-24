import { tool, generateText } from 'ai';
import { Session } from '@/lib/auth';
import { z } from 'zod';
import { getDocumentById } from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';

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
      const documentId = defaultDocumentId;

      try {
        // --- Validation ---
        if (!description.trim()) {
          return { error: 'No update description provided.' };
        }

        if (!documentId ||
            documentId === 'undefined' ||
            documentId === 'null' ||
            documentId.length < 32) {
          return { error: `Invalid document ID: "${documentId}".` };
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(documentId)) {
          return { error: `Invalid document ID format: "${documentId}".` };
        }

        // --- Fetch Document ---
        const document = await getDocumentById({ id: documentId });
        if (!document) {
          console.error(`[AI Tool] Document not found with ID: ${documentId}`);
          return { error: 'Document not found' };
        }
        const originalContent = document.content || '';

        // Generate full replacement content
        const prompt = `You are an expert editor. Here is the ORIGINAL document in :\n\n${originalContent}\n\n---\n\nTASK: Apply the following edits succinctly, returning ONLY the fully updated document in Markdown format.\nDESCRIPTION: "${description}"`;

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
          status: 'Update proposal generated.',
        };

      } catch (error: any) {
        console.error('[AI Tool] updateDocument failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        // No dataStream to write to, just return error
        return {
          error: 'Failed to generate document update: ' + errorMessage,
        };
      }
    },
  });
