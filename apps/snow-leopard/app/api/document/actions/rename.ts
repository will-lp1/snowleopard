import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers
import { renameDocumentTitle, getDocumentById } from '@/lib/db/queries'; // Import Drizzle queries

/**
 * Handles document rename operations (POST)
 */
export async function renameDocument(request: NextRequest, body: any) {
  try {
    // --- Authentication --- 
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });
    
    if (!session?.user?.id) {
      console.warn('[Document API - RENAME] Rename request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    
    // --- Input Validation --- 
    const { id: documentId, title: newTitle } = body; // Rename for clarity
    
    if (!documentId || !newTitle) {
      console.error('[Document API - RENAME] Missing required parameters:', { documentId, newTitle });
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    console.log(`[Document API - RENAME] User ${userId} renaming document ${documentId} to "${newTitle}"`);
    
    // Validate ID format (optional but good practice)
    if (documentId === 'undefined' || documentId === 'null' || documentId === 'init') {
      console.error(`[Document API - RENAME] Invalid document ID: ${documentId}`);
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(documentId)) {
      console.error(`[Document API - RENAME] Invalid document ID format: ${documentId}`);
      return NextResponse.json({ 
        error: `Invalid document ID format. Must be a valid UUID.` 
      }, { status: 400 });
    }

    // --- Rename Operation --- 
    // The Drizzle query function handles ownership check and updates title for all versions
    await renameDocumentTitle({ 
      userId: userId, 
      documentId: documentId, 
      newTitle: newTitle 
    });
      
    // --- Fetch and Return Updated Document --- 
    // Fetch the latest version to return updated data
    const updatedDocument = await getDocumentById({ id: documentId });
    
    if (!updatedDocument) {
        console.error(`[Document API - RENAME] Failed to retrieve document ${documentId} after renaming.`);
        // Should not happen if rename succeeded, but handle defensively
        return NextResponse.json({ error: 'Failed to retrieve updated document data.'}, { status: 500 });
    }
      
    console.log(`[Document API - RENAME] Document renamed successfully: ${documentId} to "${newTitle}"`);
    return NextResponse.json(updatedDocument); // Return latest document version data

  } catch (error: any) {
    // Handle potential errors from the query function (e.g., Unauthorized)
    console.error('[Document API - RENAME] Rename error:', error);
    
    let status = 500;
    let message = 'Failed to rename document';

    if (error.message?.includes('Unauthorized') || error.message?.includes('not found')) {
      status = 403; // Or 404 depending on desired feedback
      message = 'Unauthorized or document not found';
    }

    return NextResponse.json({ 
      error: message, 
      detail: error instanceof Error ? error.message : String(error) 
    }, { status: status });
  }
} 