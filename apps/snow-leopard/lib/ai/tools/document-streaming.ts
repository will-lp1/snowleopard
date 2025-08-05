import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { Session } from '@/lib/auth';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';
import type { ChatMessage } from '@/lib/types';

interface CreateDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const streamingDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      'Generates content based on a title or prompt and streams it into the active document view. Use this to start writing or add content.',
    inputSchema: z.object({
      title: z.string().describe('The title or topic to generate content about.'),
      kind: z.enum(artifactKinds).describe('The kind of content to generate (e.g., text).')
    }),
    execute: async ({ title, kind }) => {
      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for requested kind: ${kind}`);
      }

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      });

      await documentHandler.onCreateDocument({
        title,
        dataStream,
        session,
      });

      dataStream.write({ type: 'data-finish', data: null, transient: true });

      return {
        title,
        kind,
        content: 'Content generation streamed.',
      };
    },
  });
