import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers
import { getDocumentsById, getCurrentDocumentsByUserId, getPaginatedDocumentsByUserId } from '@/lib/db/queries'; // Import Drizzle queries
import { getGT } from 'gt-next/server';

/**
 * Handles document retrieval operations (GET)
 */
export async function getDocuments(request: NextRequest) {
  try {
    const t = await getGT();
    // --- Authentication --- 
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      console.warn('[Document API - GET] Unauthorized request');
      return NextResponse.json({ error: t('Unauthorized'), documents: [] }, { status: 401 });
    }
    const userId = session.user.id;
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const limitParam = searchParams.get('limit');
    const endingBefore = searchParams.get('ending_before');
    
    console.log(`[Document API - GET] Fetch request for user ${userId}:`, { id, limit: limitParam, endingBefore });
    
    // --- Fetch by specific document ID --- 
    if (id) {
       // Validate document ID (moved inside the 'if' block)
      if (id === 'undefined' || id === 'null' || id === 'init') {
        console.warn(`[Document API - GET] Invalid document ID: ${id}`);
        // Return empty array for invalid ID requests
        return NextResponse.json([]); 
      }
      
      // Fetch using Drizzle query (already checks user ID)
      const documents = await getDocumentsById({ ids: [id], userId: userId }); 
      return NextResponse.json(documents || []); // Ensure array is returned
    } 
    
    // --- Handle pagination ---
    if (limitParam) {
      console.log(`[Document API - GET] Fetching paginated documents for user: ${userId}`);
      try {
        const limit = parseInt(limitParam, 10);
        if (isNaN(limit) || limit <= 0) {
          return NextResponse.json({ error: t('Invalid limit parameter') }, { status: 400 });
        }
        const result = await getPaginatedDocumentsByUserId({ userId, limit, endingBefore });
        return NextResponse.json(result);
      } catch (error) {
         console.error('[Document API - GET] Error fetching paginated documents:', error);
         return NextResponse.json(
          { error: t('Failed to fetch paginated documents') }, 
          { status: 500 }
        );
      }
    }
    
    // --- Fetch all *current* documents for the user (legacy) --- 
    else {
      console.log(`[Document API - GET] Fetching all *current* documents for user (legacy): ${userId}`);
      try {
        // Fetch using the new Drizzle query
        const documents = await getCurrentDocumentsByUserId({ userId: userId });
        return NextResponse.json(documents || []); // Return the filtered documents
      } catch (error) {
        console.error('[Document API - GET] Error fetching all current documents:', error);
        return NextResponse.json(
          { error: t('Failed to fetch documents'), documents: [] }, 
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('[Document API - GET] General error:', error);
    return NextResponse.json(
      { error: t('Failed to fetch documents'), documents: [] }, 
      { status: 500 }
    );
  }
} 