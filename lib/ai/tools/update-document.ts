import { tool, generateText } from 'ai';
import { Session } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { getDocumentById } from '@/lib/db/queries';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import type { Document } from '@/lib/db/schema';
import { myProvider } from '@/lib/ai/providers';

interface UpdateDocumentProps {
  session: Session;
  documentId?: string;
}

export const updateDocument = ({ session, documentId: defaultDocumentId }: UpdateDocumentProps) =>
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
        if (!documentId ||
            documentId === 'undefined' ||
            documentId === 'null' ||
            documentId.length < 32) { 
          console.error('[AI Tool] Invalid document ID provided:', documentId);
          // No dataStream, just return error
          return { error: `Invalid document ID: "${documentId}".` };
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(documentId)) {
          console.error('[AI Tool] Document ID is not a valid UUID format:', documentId);
          return { error: `Invalid document ID format: "${documentId}".` };
        }
        console.log(`[AI Tool] Generating update proposal for document ID: ${documentId}`);

        // --- Fetch Document ---
        const document = await getDocumentById({ id: documentId });
        if (!document) {
          console.error(`[AI Tool] Document not found with ID: ${documentId}`);
          return { error: 'Document not found' };
        }
        const originalContent = document.content || '';

        // --- Find Handler (Optional - could simplify if only text) ---
        // Assuming text for now, but handler logic could be kept if needed for prompt generation
        // const documentHandler = ...; 
        // if (!documentHandler) ... return error ...

        // --- Generate FULL New Content --- 
        console.log(`[AI Tool] Generating full update based on description.`);
        
        const prompt = `Given the following document content (Original):\n\n${originalContent}\n\nUpdate it based on this description: \"${description}\". Output ONLY the complete, fully updated document content.`;

        // Use generateText from 'ai' library
        const { text: newContent } = await generateText({
           model: myProvider.languageModel('artifact-model'), 
           prompt: prompt,
        });

        console.log(`[AI Tool] Update generation complete for document ${documentId}.`);

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
        console.error('[AI Tool] Error generating document update proposal:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        // No dataStream to write to, just return error
        return {
          error: 'Failed to generate document update: ' + errorMessage,
        };
      }
    },
  });
