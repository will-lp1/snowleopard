import { DataStreamWriter, tool } from 'ai';
import { Session } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { getDocumentById } from '@/lib/db/queries';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import type { Document } from '@/lib/db/schema';
import { createClient } from '@/utils/supabase/server';

interface UpdateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
  documentId?: string;
}

export const updateDocument = ({ session, dataStream, documentId: defaultDocumentId }: UpdateDocumentProps) =>
  tool({
    description: 'Update a document with the given description. If no document ID is provided, the current document in context will be used.',
    parameters: z.object({
      id: z.string()
        .optional()
        .describe('The ID of the document to update. If not provided, the current document in context will be used.'),
      description: z
        .string()
        .describe('The description of changes that need to be made'),
    }),
    execute: async ({ id, description }) => {
      try {
        // Use provided ID or default to the one passed to the tool
        const documentId = id || defaultDocumentId;
        
        if (!documentId) {
          console.error('[AI Tool] No document ID provided and no default available');
          return {
            error: 'No document ID provided. Please specify a document to update.'
          };
        }
        
        console.log(`[AI Tool] Updating document with ID: ${documentId}`);
        
        // Fetch document
        const document = await getDocumentById({ id: documentId });

        if (!document) {
          console.error(`[AI Tool] Document not found with ID: ${documentId}`);
          return {
            error: 'Document not found',
          };
        }

        // Notify the user that we're updating the document
        dataStream.writeData({
          type: 'clear',
          content: document.title,
        });

        // Find appropriate document handler
        const documentHandler = documentHandlersByArtifactKind.find(
          (documentHandlerByArtifactKind) =>
            documentHandlerByArtifactKind.kind === document.kind,
        );

        if (!documentHandler) {
          const error = `No document handler found for kind: ${document.kind}`;
          console.error(`[AI Tool] ${error}`);
          throw new Error(error);
        }

        // Assert document kind matches handler kind
        if (document.kind === documentHandler.kind) {
          // Process the update using the appropriate handler
          console.log(`[AI Tool] Using document handler for kind: ${document.kind}`);
          
          // Call the document handler to process the update
          const result = await documentHandler.onUpdateDocument({
            document: {
              ...document,
              kind: document.kind as typeof documentHandler.kind
            },
            description,
            dataStream,
            session,
          });

          // Get access to Supabase client
          const supabase = await createClient();
          
          // Get the updated content from the document handler result
          console.log(`[AI Tool] Got updated content from handler, length: ${result.content.length} chars`);
          
          console.log(`[AI Tool] Saving updated document content to ID: ${documentId}`);
          
          // Save the updated document
          const { error: updateError } = await supabase
            .from('Document')
            .insert({
              id: document.id,
              title: document.title,
              content: result.content, // Use the content from the result
              kind: document.kind,
              chatId: document.chatId,
              userId: session.user.id,
              createdAt: new Date().toISOString(),
            });
            
          if (updateError) {
            console.error('[AI Tool] Error saving document update:', updateError);
            throw new Error(`Failed to save document update: ${updateError.message}`);
          }
          
          console.log(`[AI Tool] Document updated successfully: ${documentId}`);
          
          // Signal that the update is complete with metadata to trigger diff view
          dataStream.writeData({ 
            type: 'artifactUpdate', 
            content: JSON.stringify({
              type: 'documentUpdated',
              documentId: documentId,
              title: document.title,
              previousContent: document.content,
              newContent: result.content // Use the content from the result
            })
          });
          
          // Emit an event to notify client-side components
          if (typeof window !== 'undefined') {
            try {
              const event = new CustomEvent('artifactUpdate', {
                detail: {
                  type: 'documentUpdated',
                  documentId: documentId,
                  title: document.title,
                  previousContent: document.content,
                  newContent: result.content
                }
              });
              window.dispatchEvent(event);
              console.log('[AI Tool] Dispatched artifactUpdate event to window');
            } catch (error) {
              console.error('[AI Tool] Error dispatching event:', error);
            }
          }
          
          dataStream.writeData({ 
            type: 'finish', 
            content: 'Document updated successfully'
          });
          
          // Return success response
          return {
            id: documentId,
            title: document.title,
            kind: document.kind,
            content: 'The document has been updated successfully.',
          };
        } else {
          const error = `Document kind ${document.kind} does not match handler kind ${documentHandler.kind}`;
          console.error(`[AI Tool] ${error}`);
          throw new Error(error);
        }
      } catch (error) {
        console.error('[AI Tool] Error updating document:', error);
        return {
          error: 'Failed to update document: ' + (error instanceof Error ? error.message : String(error)),
        };
      }
    },
  });
