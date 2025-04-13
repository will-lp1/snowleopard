import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles document rename operations
 */
export async function renameDocument(request: NextRequest, body: any) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document API] Rename request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id, title } = body;
    
    if (!id || !title) {
      console.error('[Document API] Missing required parameters:', { id, title });
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    console.log('[Document API] Rename request received:', { id, title });
    
    // Validate ID format to prevent errors
    if (id === 'undefined' || id === 'null' || id === 'init') {
      console.error('[Document API] Invalid document ID:', id);
      return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 });
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.error(`[Document API] Invalid document ID format: ${id}`);
      return NextResponse.json({ 
        error: `Invalid document ID format. Must be a valid UUID.` 
      }, { status: 400 });
    }

    try {
      // First check if the document exists and verify ownership
      const { data: existingDocs, error: queryError } = await supabase
        .from('Document')
        .select('id, userId, createdAt')
        .eq('id', id)
        .order('createdAt', { ascending: false })
        .limit(1);
      
      if (queryError) {
        console.error('[Document API] Error checking for existing document:', queryError);
        return NextResponse.json({ error: 'Failed to check document existence' }, { status: 500 });
      }
      
      // If no documents found, the document doesn't exist
      if (!existingDocs || existingDocs.length === 0) {
        return NextResponse.json({ 
          error: 'Document not found', 
        }, { status: 404 });
      }
      
      // Check ownership if document exists
      if (existingDocs[0].userId !== session.user.id) {
        console.error('[Document API] User does not own this document');
        return NextResponse.json({ 
          error: 'Unauthorized - you do not own this document' 
        }, { status: 403 });
      }
        
      // Document exists and user owns it - UPDATE it
      // Use the most recent version's createdAt timestamp to ensure we update the correct version
      const latestCreatedAt = existingDocs[0].createdAt;
      
      const { error: updateError, data: updateData } = await supabase
        .from('Document')
        .update({
          title: title,
          // Only update the title, nothing else
        })
        .eq('id', id)
        .eq('createdAt', latestCreatedAt)
        .select('id, title, createdAt')
        .single();
        
      if (updateError) {
        console.error('[Document API] Error renaming document:', updateError);
        return NextResponse.json({ error: 'Failed to rename document' }, { status: 500 });
      }
      
      // Get latest document data to return the full document
      const { data: document, error: getError } = await supabase
        .from('Document')
        .select('*')
        .eq('id', id)
        .single();
      
      if (getError) {
        console.error('[Document API] Error fetching renamed document:', getError);
        // Still return the update data since the rename was successful
        return NextResponse.json(updateData);
      }
      
      console.log(`[Document API] Document renamed successfully: ${id} to "${title}"`);
      return NextResponse.json(document);
    } catch (dbError) {
      console.error('[Document API] Database operation error:', dbError);
      return NextResponse.json({ error: 'Database operation failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Document API] Rename error:', error);
    return NextResponse.json({ error: 'Failed to rename document' }, { status: 500 });
  }
} 