import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers'; 
import { differenceInMinutes } from 'date-fns';
import {
  getCurrentDocumentVersion,
  updateCurrentDocumentVersion,
  createNewDocumentVersion,
  getChatExists,
  getLatestDocumentById 
} from '@/lib/db/queries';
import { Document } from '@snow-leopard/db';

const VERSION_THRESHOLD_MINUTES = 10;

/**
 * Handles document update operations (POST)
 * Updates the latest version if within threshold and metadata matches,
 * otherwise creates a new version.
 */
export async function updateDocument(request: NextRequest, body: any): Promise<NextResponse> {
  try {
    // --- Authentication --- 
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });
    
    if (!session?.user?.id) {
      console.warn('[Document API - UPDATE] Update request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    
    // --- Input Validation --- 
    const { 
      id: documentId,
      content: inputContent = '',
      kind: inputKind = 'text',
      chatId: inputChatId
    } = body;
    
    const content = inputContent;
    
    console.log('[Document API - UPDATE] Received:', { 
      id: documentId, 
      contentLength: content?.length || 0,
      chatId: inputChatId || 'none'
    });
    
    // Validate ID format (essential before querying)
    if (!documentId || documentId === 'undefined' || documentId === 'null' || documentId === 'init') {
      console.error(`[Document API - UPDATE] Invalid document ID: ${documentId}`);
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(documentId)) {
      console.error(`[Document API - UPDATE] Invalid document ID format: ${documentId}`);
      return NextResponse.json({ 
        error: `Invalid document ID format. Must be a valid UUID.` 
      }, { status: 400 });
    }

    // --- Versioning Logic --- 
    let updatedOrCreatedDocument: typeof Document.$inferSelect | null = null;

    try {
      const currentVersion = await getCurrentDocumentVersion({ userId, documentId });
      
      let shouldUpdateCurrent = false;
      let titleForNewVersion = 'Untitled Document';

      if (currentVersion && currentVersion.updatedAt) {
        titleForNewVersion = currentVersion.title;
        
        const minutesSinceLastUpdate = differenceInMinutes(new Date(), currentVersion.updatedAt);
        const metadataMatches = currentVersion.kind === inputKind;
        
        console.log(`[Document API - UPDATE] Time Check - Now: ${new Date().toISOString()}, UpdatedAt: ${currentVersion.updatedAt.toISOString()}`); // Log actual dates used

        if (minutesSinceLastUpdate < VERSION_THRESHOLD_MINUTES && metadataMatches) {
          shouldUpdateCurrent = true;
        }
         console.log(`[Document API - UPDATE] Threshold Check for ${documentId}: ` +
                     `Current version found (updated ${minutesSinceLastUpdate}m ago). ` +
                     `Threshold: ${VERSION_THRESHOLD_MINUTES}m. Metadata matches: ${metadataMatches}. ` +
                     `Decision: ${shouldUpdateCurrent ? 'UPDATE current' : 'CREATE new'}`);
      } else {
          // If no current version exists, try fetching the latest known version to get its title
          const latestVersionForTitle = await getLatestDocumentById({ id: documentId });
          if (latestVersionForTitle) {
             titleForNewVersion = latestVersionForTitle.title;
             console.log(`[Document API - UPDATE] No current version found for ${documentId}, using title "${titleForNewVersion}" from latest version.`);
          } else {
             console.log(`[Document API - UPDATE] No current or latest version found for ${documentId}. Creating new version with default title.`);
          }
      }

      // 3. Perform Update or Create
      if (shouldUpdateCurrent) {
        // --- Update Existing Current Version --- 
        console.log(`[Document API - UPDATE] Updating current version for ${documentId} (within ${VERSION_THRESHOLD_MINUTES} mins threshold and metadata matches)`);
        updatedOrCreatedDocument = await updateCurrentDocumentVersion({
          userId,
          documentId,
          content,
        });
         if (!updatedOrCreatedDocument) {
            throw new Error('updateCurrentDocumentVersion returned null unexpectedly.');
        }
      } else {
        // --- Create New Version --- 
        console.log(`[Document API - UPDATE] Creating new version for ${documentId} (no current, threshold exceeded, or metadata changed)`);
        
        let finalChatId: string | null = null;
        if (inputChatId) {
          console.log(`[Document API - UPDATE] Checking if chat ${inputChatId} exists...`);
          const chatExists = await getChatExists({ chatId: inputChatId });
          if (chatExists) {
            finalChatId = inputChatId;
            console.log(`[Document API - UPDATE] Verified chat exists: ${inputChatId}`);
          } else {
            console.warn(`[Document API - UPDATE] Chat with ID ${inputChatId} not found or invalid, creating new document version without chat link`);
          }
        }
        
        updatedOrCreatedDocument = await createNewDocumentVersion({
          id: documentId,
          userId: userId,
          title: titleForNewVersion,
          content: content,
          kind: inputKind,
          chatId: finalChatId,
        });
         if (!updatedOrCreatedDocument) {
            throw new Error('createNewDocumentVersion returned null unexpectedly.');
        }
      }

      const finalDocumentState = updatedOrCreatedDocument;
      
      if (!finalDocumentState) {
          console.error(`[Document API - UPDATE] Failed to retrieve document ${documentId} after operation.`);
          const fallbackState = await getLatestDocumentById({ id: documentId });
           if (fallbackState) {
               console.warn('[Document API - UPDATE] Returning fallback state after initial retrieval failed.')
               return NextResponse.json(fallbackState);
           } else {
                return NextResponse.json({ error: 'Failed to retrieve updated document data after operation and fallback.'}, { status: 500 });
           }
      }

      console.log(`[Document API - UPDATE] Document ${documentId} processed successfully.`);
      return NextResponse.json(finalDocumentState); 

    } catch (dbError: any) {
      console.error(`[Document API - UPDATE] Database operation error for doc ${documentId}:`, dbError);
      if (dbError.message === 'Document not found or unauthorized.') {
          return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 });
      }
      return NextResponse.json({ 
        error: `Database operation failed: ${dbError.message || String(dbError)}`
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[Document API - UPDATE] General update error:', error);
    return NextResponse.json({ 
      error: `Failed to update document: ${error.message || String(error)}`
    }, { status: 500 });
  }
} 