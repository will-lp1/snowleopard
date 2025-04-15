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
        
        console.log(`[AI Tool] Proposing update for document with ID: ${documentId}`);
        
        try {
          // Fetch document
          const document = await getDocumentById({ id: documentId });
  
          if (!document) {
            console.error(`[AI Tool] Document not found with ID: ${documentId}`);
            return {
              error: 'Document not found',
            };
          }
  
          // Notify the user that we're processing the update proposal
          dataStream.writeData({
            type: 'clear', 
            content: `Processing update proposal for: ${document.title}`,
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
            
            // Call the document handler to GET THE PROPOSED content
            // This should NO LONGER save to DB itself (verified in lib/artifacts/server.ts)
            const result = await documentHandler.onUpdateDocument({
              document: {
                ...document,
                kind: document.kind as typeof documentHandler.kind
              },
              description,
              dataStream, // Pass stream for potential intermediate updates from handler
              session,
            });

            // Get the proposed content from the document handler result
            const proposedNewContent = result.content;
            const originalContent = document.content || '';
            console.log(`[AI Tool] Got proposed content from handler, length: ${proposedNewContent.length} chars`);
            
            // --- Stream Diff Data to Client --- 
            // 1. Send original content
            dataStream.writeData({ 
              type: 'original-content', 
              content: originalContent
            });
            
            // 2. Send new proposed content
            dataStream.writeData({ 
              type: 'new-content', 
              content: proposedNewContent
            });
            
            // 3. Signal that diff data is ready for the editor
            dataStream.writeData({ 
              type: 'diff-ready', 
              content: JSON.stringify({
                documentId: documentId,
                title: document.title,
                // Note: Actual content is sent separately above
              })
            });
            // --- End Diff Data Streaming ---
            
            // Signal the overall tool execution is finished
            dataStream.writeData({ 
              type: 'finish', 
              content: 'Update proposed. Please review the changes.'
            });
            
            // Return success response (content indicates proposal)
            return {
              id: documentId,
              title: document.title,
              kind: document.kind,
              content: 'Changes have been proposed. Please review them in the editor.',
            };
          } else {
            const error = `Document kind ${document.kind} does not match handler kind ${documentHandler.kind}`;
            console.error(`[AI Tool] ${error}`);
            throw new Error(error);
          }
        } catch (error) {
          console.error('[AI Tool] Error fetching/processing document:', error);
          // Still stream finish and error markers if possible
          dataStream.writeData({ type: 'finish', content: 'Error proposing update.' });
          return {
            error: 'Failed to process document update: ' + (error instanceof Error ? error.message : String(error)),
          };
        }
      } catch (error) {
        console.error('[AI Tool] Error proposing document update:', error);
        // Stream finish and error markers
        dataStream.writeData({ type: 'finish', content: 'Error proposing update.' });
        return {
          error: 'Failed to propose document update: ' + (error instanceof Error ? error.message : String(error)),
        };
      } finally {
         // Ensure dataStream is properly closed if necessary, though `streamText` usually handles this.
         // dataStream.close(); // Might not be needed depending on `ai` library handling.
      }
    },
  });
