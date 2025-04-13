import { createClient } from '@/lib/supabase/server';

/**
 * Gets a file by path using semantic search
 * This is a simplified utility that could be extended in the future
 * 
 * @param path The file path to search for
 * @returns The file content and metadata
 */
export async function getFileByPath(path: string) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      throw new Error('Unauthorized');
    }
    
    // For now, this is a basic implementation that just checks the database
    // In a real app, this could use a file system or other data store
    const { data: documents, error } = await supabase
      .from('Document')
      .select('id, title, content, createdAt')
      .eq('userId', session.user.id)
      .eq('is_current', true)
      .or(`title.ilike.%${path}%,id.eq.${path}`)
      .order('createdAt', { ascending: false })
      .limit(1);
    
    if (error) {
      throw error;
    }
    
    if (!documents || documents.length === 0) {
      return null;
    }
    
    const document = documents[0];
    
    return {
      id: document.id,
      title: document.title,
      content: document.content,
      createdAt: document.createdAt
    };
  } catch (error) {
    console.error('Error getting file by path:', error);
    return null;
  }
}

/**
 * Search documents by query string
 * Returns documents matching the search criteria
 * 
 * @param query The search query
 * @param limit Maximum number of results to return
 * @returns Array of matching documents
 */
export async function searchDocuments({ 
  query, 
  limit = 5 
}: { 
  query: string; 
  limit?: number;
}) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document Search] Unauthorized search request');
      throw new Error('Unauthorized');
    }
    
    console.log(`[Document Search] Searching for: "${query}"`);
    
    // Basic search implementation using ilike
    const { data: documents, error } = await supabase
      .from('Document')
      .select('id, title, createdAt, content')
      .eq('userId', session.user.id)
      .eq('is_current', true)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .order('createdAt', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[Document Search] Database error:', error);
      throw error;
    }
    
    // Format results for the mention UI
    const results = documents?.map(doc => ({
      id: doc.id,
      title: doc.title || 'Untitled Document',
      type: 'document'
    })) || [];
    
    return {
      results,
      query
    };
  } catch (error) {
    console.error('[Document Search] Error executing search:', error);
    return {
      results: [],
      error: 'Failed to search documents'
    };
  }
} 