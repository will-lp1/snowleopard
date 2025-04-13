import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Handles document update operations
 */
export async function updateDocument(request: NextRequest, body: any) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document API] Update request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id, title, content, kind, chatId } = body;
    
    console.log('[Document API] Update request received:', { 
      id, 
      title, 
      contentLength: content?.length || 0,
      kind,
      chatId: chatId || 'none'
    });
    
    // Validate ID format to prevent errors
    if (!id || id === 'undefined' || id === 'null' || id === 'init') {
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
      // Verify chatId exists if provided
      let finalChatId = null;
      if (chatId) {
        const { data: chatData, error: chatError } = await supabase
          .from('Chat')
          .select('id')
          .eq('id', chatId)
          .single();
          
        if (chatData && !chatError) {
          finalChatId = chatId;
          console.log(`[Document API] Verified chat exists: ${chatId}`);
        } else {
          console.warn(`[Document API] Chat with ID ${chatId} not found, updating document without chat link`);
        }
      }
      
      // --- NEW LOGIC: Call database function to handle versioning ---
      const { data: updateData, error: rpcError } = await supabase.rpc('create_new_document_version', {
        p_id: id,
        p_user_id: session.user.id,
        p_title: title || 'Document',
        p_content: content || '',
        p_kind: kind || 'text',
        p_chat_id: finalChatId,
      });

      if (rpcError) {
        console.error('[Document API] Error calling create_new_document_version RPC:', rpcError);
        // Check if the error is due to the function not returning rows (e.g., permission issue or internal error)
        if (rpcError.code === 'PGRST116') { 
          // Attempt to fetch the document to verify ownership and existence before failing
          const { data: verifyDoc, error: verifyError } = await supabase
            .from('Document')
            .select('id, userId')
            .eq('id', id)
            .eq('userId', session.user.id)
            .maybeSingle(); // Use maybeSingle to handle not found

          if (verifyError) {
            console.error('[Document API] Error verifying document after RPC failure:', verifyError);
            return NextResponse.json({ error: 'Failed to update document and verification failed.' }, { status: 500 });
          }
          
          if (!verifyDoc) {
            console.error('[Document API] Document not found or user does not own it after RPC failure.');
            return NextResponse.json({ error: 'Document not found or unauthorized.' }, { status: 404 });
          }

          // If verification passes but RPC failed, it's likely an internal RPC issue
          console.error('[Document API] RPC failed despite document verification passing. Possible function error.');
        }
        return NextResponse.json({ error: 'Failed to update document via RPC.' }, { status: 500 });
      }
      
      // RPC function returns an array, we expect one record
      if (!updateData || !Array.isArray(updateData) || updateData.length === 0) {
        console.error('[Document API] RPC function did not return the expected document data.');
        return NextResponse.json({ error: 'Failed to retrieve updated document data.' }, { status: 500 });
      }

      console.log(`[Document API] Document updated successfully via RPC: ${id}`);
      return NextResponse.json(updateData[0]); // Return the first (and only) element from the array
      
      /* --- OLD LOGIC (Commented out for reference) ---
      // First check if the document exists and verify ownership
      // ... (previous existence and ownership check logic) ...
        
      // Document exists and user owns it - UPDATE it
      // ... (previous .update() logic) ...
      */
      
    } catch (dbError) {
      console.error('[Document API] Database operation error:', dbError);
      return NextResponse.json({ error: 'Database operation failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Document API] Update error:', error);
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 });
  }
} 