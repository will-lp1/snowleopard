import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles document deletion operations
 */
export async function deleteDocument(request: NextRequest, body: any) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document API] Delete request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = body;
    
    console.log('[Document API] Delete request received for document:', id);
    
    // Validate document ID 
    if (!id || id === 'undefined' || id === 'null' || id === 'init') {
      console.error('[Document API] Invalid document ID for deletion:', id);
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    
    // Check if document exists and user owns it - get all versions, don't use maybeSingle()
    const { data: documents, error: fetchError } = await supabase
      .from('Document')
      .select('id, userId')
      .eq('id', id);
      
    if (fetchError) {
      console.error('[Document API] Error fetching document for deletion:', fetchError);
      return NextResponse.json({ error: 'Failed to check document ownership' }, { status: 500 });
    }
    
    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Verify ownership - check if at least one version is owned by the user
    // All versions should have the same owner, but we'll check to be safe
    const userOwnsDocument = documents.some(doc => doc.userId === session.user.id);
    
    if (!userOwnsDocument) {
      console.warn('[Document API] Unauthorized deletion attempt for document:', id);
      return NextResponse.json({ error: 'Unauthorized - you do not own this document' }, { status: 403 });
    }
    
    // Delete all versions of the document
    const { error: deleteError } = await supabase
      .from('Document')
      .delete()
      .eq('id', id);
      
    if (deleteError) {
      console.error('[Document API] Error deleting document:', deleteError);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }
    
    console.log('[Document API] Document deleted successfully:', id);
    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('[Document API] Delete error:', error);
    return NextResponse.json({ 
      error: `Failed to delete document: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
} 