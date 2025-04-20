import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers
import { 
  saveDocument, 
  checkDocumentOwnership, 
  setOlderVersionsNotCurrent, 
  getDocumentById 
} from '@/lib/db/queries'; // Import Drizzle queries
import type { ArtifactKind } from '@/components/artifact'; // Import type

/**
 * Handles document update operations (POST)
 * Creates a new version of the document, marking older ones as not current.
 */
export async function updateDocument(request: NextRequest, body: any) {
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
      id: documentId, // Rename for clarity
      title = 'Untitled Document', 
      content = '', 
      kind = 'text', 
      chatId // Optional chatId (currently ignored by saveDocument)
    } = body;
    
    console.log(`[Document API - UPDATE] User ${userId} updating document: ${documentId}`);
    
    // Validate ID format 
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

    // --- Authorization & Versioning --- 
    // 1. Check if user owns any version of this document
    const ownsExistingVersion = await checkDocumentOwnership({ userId, documentId });

    if (!ownsExistingVersion) {
      console.warn(`[Document API - UPDATE] User ${userId} cannot update document ${documentId} (not found or not owned).`);
      // Return 404 Not Found, as the document doesn't exist for this user
      return NextResponse.json({ error: 'Document not found or unauthorized' }, { status: 404 }); 
    }

    // 2. Mark older versions as not current
    console.log(`[Document API - UPDATE] Setting older versions of ${documentId} to not current.`);
    await setOlderVersionsNotCurrent({ userId, documentId });
    
    // 3. Save the new version (is_current defaults to true)
    await saveDocument({
      id: documentId,
      title: title,
      content: content,
      kind: kind as ArtifactKind,
      userId: userId,
      // chatId: chatId, // Pass if schema/query supports it
    });

    // --- Fetch and Return Newly Created Document --- 
    const newDocumentVersion = await getDocumentById({ id: documentId }); 
    
    if (!newDocumentVersion) {
       console.error(`[Document API - UPDATE] Failed to retrieve document ${documentId} immediately after saving update.`);
       return NextResponse.json({ error: 'Failed to retrieve updated document data.'}, { status: 500 });
    }

    console.log(`[Document API - UPDATE] Document version updated successfully: ${documentId}`);
    return NextResponse.json(newDocumentVersion); // Return the newly created version data

  } catch (error: any) {
    console.error('[Document API - UPDATE] Update error:', error);
    return NextResponse.json({ 
      error: `Failed to update document: ${error.message || String(error)}`
    }, { status: 500 });
  }
} 