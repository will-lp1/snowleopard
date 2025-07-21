import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import { Session } from '@/lib/auth';
import { artifactKinds } from '@/lib/artifacts/server';
import { saveDocument } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import type { ArtifactKind } from '@/components/artifact';
import { getGT } from 'gt-next/server';

interface CreateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const createDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      'Creates a new document record in the database, streams back its ID so the editor can initialize it.',
    parameters: z.object({
      title: z.string().describe('The title for the new document.'),
      kind: z
        .enum(artifactKinds)
        .describe('The kind of document to create (e.g., text).')
        .optional(),
    }),
    execute: async ({ title, kind = 'text' }) => {
      // Generate a new document ID
      const newDocumentId = generateUUID();
      const userId = session.user.id;

      try {
        // Save the new document with empty content
        await saveDocument({
          id: newDocumentId,
          title,
          content: '',
          kind: kind as ArtifactKind,
          userId,
        });

        // Stream the new ID to the client
        dataStream.writeData({ type: 'id', content: newDocumentId });
        // Delay to allow page navigation and editor initialization
        await new Promise((resolve) => setTimeout(resolve, 4500));
        // Signal that creation is finished
        dataStream.writeData({ type: 'finish', content: '' });

        const t = await getGT();
        return { content: t('New document created.') };
      } catch (error: any) {
        console.error('[AI Tool] Failed to create document:', error);
        throw new Error(`Failed to create document: ${error.message || error}`);
      }
    },
  });
