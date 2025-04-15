import { DataStreamWriter, tool } from 'ai';
import { Session } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';
import { getDocumentById } from '@/lib/db/queries';
import { documentHandlersByArtifactKind } from '@/lib/artifacts/server';
import type { Document } from '@/lib/db/schema';
import { createClient } from '@/lib/supabase/server';

interface UpdateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
  documentId?: string;
}

export const updateDocument = ({ session, dataStream, documentId: defaultDocumentId }: UpdateDocumentProps) =>
  tool({
    description: 'Update a document with the given description. If no document ID is provided, the current document in context will be used.',
    parameters: z.object({
      description: z
        .string()
        .describe('The description of changes that need to be made'),
    }),
    execute: async ({ description }) => {
      try {
        // Use provided ID or default to the one passed to the tool
        const documentId = defaultDocumentId;
        
        // Check for invalid document ID values
        if (!documentId || 
            documentId === 'undefined' || 
            documentId === 'null' || 
            documentId === 'current document ID' ||
            documentId === 'current document' ||
            documentId.includes('current') ||
            documentId.length < 32) { // UUID should be at least 32 chars
          console.error('[AI Tool] Invalid document ID provided:', documentId);
          return {
            error: `Invalid document ID: "${documentId}". Please use a valid document UUID.`
          };
        }
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(documentId)) {
          console.error('[AI Tool] Document ID is not a valid UUID format:', documentId);
          return {
            error: `Invalid document ID format: "${documentId}". Document IDs must be in UUID format.`
          };
        }
        
        console.log(`[AI Tool] Updating document with ID: ${documentId}`);
        
        try {
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
            
            // Store the current content for diff view
            const previousContent = document.content || '';
            
            // Call the document handler to process the update and get new content
            const result = await documentHandler.onUpdateDocument({
              document: {
                ...document,
                kind: document.kind as typeof documentHandler.kind
              },
              description,
              dataStream,
              session,
            });
            
            // Get the updated content from the document handler result
            const newContent = result.content; // Use the content from the result
            console.log(`[AI Tool] Got updated content from handler, length: ${newContent.length} chars`);
            
            // Signal that the update is complete with metadata to trigger diff view
            // This data will be captured by the Editor component and used to show section diffs
            dataStream.writeData({ 
              type: 'artifactUpdate', 
              content: JSON.stringify({
                type: 'documentUpdated',
                documentId: documentId,
                title: document.title,
                previousContent: previousContent, // Send previous content
                newContent: newContent // Send new content
              })
            });
            
            // NOTE: The client-side window event dispatch now happens in the Editor component
            // when the user accepts the diff, not here.
            
            dataStream.writeData({ 
              type: 'finish', 
              content: 'Proposed document updates are ready for review.' // Updated message
            });
            
            // Return success response indicating changes are proposed
            return {
              id: documentId,
              title: document.title,
              kind: document.kind,
              content: 'Document update proposal generated successfully. Review the changes in the editor.',
            };
          } else {
            const error = `Document kind ${document.kind} does not match handler kind ${documentHandler.kind}`;
            console.error(`[AI Tool] ${error}`);
            throw new Error(error);
          }
        } catch (error) {
          console.error('[AI Tool] Error fetching document:', error);
          return {
            error: 'Failed to fetch document: ' + (error instanceof Error ? error.message : String(error)),
          };
        }
      } catch (error) {
        console.error('[AI Tool] Error updating document:', error);
        return {
          error: 'Failed to update document: ' + (error instanceof Error ? error.message : String(error)),
        };
      }
    },
  });
