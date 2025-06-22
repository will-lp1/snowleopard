import { DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import { Session } from '@/lib/auth';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';

interface CreateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const streamingDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      'Generates content based on a title or prompt and streams it into the active document view. Use this to start writing or add content.',
    parameters: z.object({
      title: z.string().describe('The title or topic to generate content about.'),
      kind: z.enum(artifactKinds).describe('The kind of content to generate (e.g., text).')
    }),
    execute: async ({ title, kind }) => {
      // Delay to allow page navigation and editor initialization (align with createDocument)
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for requested kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        title,
        dataStream,
        session,
      });

      dataStream.writeData({ type: 'force-save', content: '' });
      
      dataStream.writeData({ type: 'finish', content: '' });

      return {
        content: 'Content generation streamed.',
      };
    },
  });
