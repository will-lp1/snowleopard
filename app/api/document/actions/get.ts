import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDocumentsById } from '@/lib/db/queries';

/**
 * Handles document retrieval operations
 */
export async function getDocuments(request: NextRequest) {
  try {
    const supabase = await createClient();
    // Use getUser() for validated session
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Check for errors or missing user
    if (userError || !user) {
      console.warn('[Document API] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized', documents: [] }, { status: 401 });
    }
    
    // Use user.id from the validated user object
    const userId = user.id;
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    console.log('[Document API] Fetch request:', { id });
    
    // Validate document ID
    if (id === 'undefined' || id === 'null' || id === 'init') {
      console.warn('[Document API] Invalid document ID:', id);
      return NextResponse.json({ error: 'Invalid document ID', documents: [] }, { status: 400 });
    }
    
    // Fetch by document ID
    if (id) {
      // Use validated userId
      const documents = await getDocumentsById({ ids: [id], userId: userId }); 
      return NextResponse.json(documents);
    } 
    // No parameters - fetch all *current* documents for the user
    else {
      console.log(`[Document API] Fetching all *current* documents for user: ${userId}`);
      try {
        // Fetch only the current documents for the user
        const { data: documents, error } = await supabase
          .from('Document')
          .select('*')
          .eq('userId', userId) // Use validated userId
          .eq('is_current', true) // *** ADDED: Fetch only current versions ***
          .order('createdAt', { ascending: false });
          
        if (error) throw error;
        
        // *** REMOVED: No longer need client-side deduplication ***
        // const dedupedDocuments = documents ? [...new Map(documents.map(doc => [doc.id, doc])).values()] : [];
        
        return NextResponse.json(documents || []); // Return the filtered documents
      } catch (error) {
        console.error('[Document API] Error fetching all current documents:', error);
        return NextResponse.json(
          { error: 'Failed to fetch documents', documents: [] }, 
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('[Document API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', documents: [] }, 
      { status: 500 }
    );
  }
} 