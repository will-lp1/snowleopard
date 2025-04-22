import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers
import { getDocumentsById, getCurrentDocumentsByUserId } from '@/lib/db/queries'; // Import Drizzle queries

/**
 * Handles document retrieval operations (GET)
 */
export async function getDocuments(request: NextRequest) {
  try {
    // --- Authentication --- 
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      console.warn('[Document API - GET] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized', documents: [] }, { status: 401 });
    }
    const userId = session.user.id;
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    console.log(`[Document API - GET] Fetch request for user ${userId}:`, { id });
    
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
    // --- Fetch all *current* documents for the user --- 
    else {
      console.log(`[Document API - GET] Fetching all *current* documents for user: ${userId}`);
      try {
        // Fetch using the new Drizzle query
        const documents = await getCurrentDocumentsByUserId({ userId: userId });
        return NextResponse.json(documents || []); // Return the filtered documents
      } catch (error) {
        console.error('[Document API - GET] Error fetching all current documents:', error);
        return NextResponse.json(
          { error: 'Failed to fetch documents', documents: [] }, 
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('[Document API - GET] General error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', documents: [] }, 
      { status: 500 }
    );
  }
} 