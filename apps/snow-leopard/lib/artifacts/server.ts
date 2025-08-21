import { textDocumentHandler } from '@/app/document/server';
import { DataStreamWriter } from 'ai';
import { Session } from '@/lib/auth';

export interface CreateDocumentCallbackProps {
  title: string;
  dataStream: DataStreamWriter;
  session: Session;
}

export interface UpdateDocumentCallbackProps {
  document: {
    id: string;
    title: string;
    content: string | null;
    createdAt: string;
    userId: string;
  };
  description: string;
  dataStream: DataStreamWriter;
  session: Session;
}

export interface DocumentHandler<T = ArtifactKind> {
  kind: T;
  // Removed id from signature
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<{ content: string }>;
}

export function createDocumentHandler<T extends ArtifactKind>(config: {
  kind: T;
  // Change signature to match our needs (no id required, no return value needed)
  onCreateDocument: (params: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<string>;
}): DocumentHandler<T> {
  return {
    kind: config.kind,
    onCreateDocument: async (args: CreateDocumentCallbackProps) => {
      // SIMPLIFIED: Just call the handler function to stream content
      // No database interaction
      await config.onCreateDocument({
        title: args.title,
        dataStream: args.dataStream,
        session: args.session,
      });
      
      // No return - just void
      return;
    },
    onUpdateDocument: async (args: UpdateDocumentCallbackProps) => {
      const draftContent = await config.onUpdateDocument({
        document: args.document,
        description: args.description,
        dataStream: args.dataStream,
        session: args.session,
      });

      // Return the updated content
      return { content: draftContent };
    },
  };
}

/*
 * Use this array to define the document handlers for each artifact kind.
 */
export const documentHandlersByArtifactKind: Array<DocumentHandler> = [
  textDocumentHandler
];

export const artifactKinds = ['text'] as const;
