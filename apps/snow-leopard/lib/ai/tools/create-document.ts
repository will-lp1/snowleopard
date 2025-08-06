import { tool, createUIMessageStream } from 'ai';
import { z } from 'zod';
import { Session } from '@/lib/auth';
import { artifactKinds } from '@/lib/artifacts/server';
import { saveDocument } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import type { ArtifactKind } from '@/components/artifact';

interface CreateDocumentProps {
  session: Session;
}

export const createDocument = ({ session }: CreateDocumentProps) =>
  tool({
    description:
      'Creates a new document record in the database, streams back its ID so the editor can initialize it.',
    inputSchema: z.object({
      title: z.string().describe('The title for the new document.'),
    }),
    execute: async ({ title = 'text' }) => {
      // Generate a new document ID
      const newDocumentId = generateUUID();
      const userId = session.user.id;

      return createUIMessageStream({
        async execute({ writer }) {
          try {
            await saveDocument({
              id: newDocumentId,
              title,
              content: '',
              userId,
            });

            writer.write({ type: 'data-id', data: newDocumentId });
            writer.write({ type: 'data-title', data: title });
            writer.write({ type: 'data-clear', data: null });

            await new Promise((resolve) => setTimeout(resolve, 450));

            writer.write({ type: 'data-finish', data: null });
          } catch (error: any) {
            writer.write({ type: 'data-error', data: error.message || String(error) });
            throw new Error(`Failed to create document: ${error.message || error}`);
          }
        },
      });
    },
  });
