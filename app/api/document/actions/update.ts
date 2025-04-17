import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { differenceInMinutes } from 'date-fns'; // Import date-fns function

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
    const currentUserId = session.user.id; // Store user ID
    
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

    // Define the time threshold for creating new versions (e.g., 10 minutes)
    const VERSION_THRESHOLD_MINUTES = 10;

    try {
      // 1. Fetch the latest version of the document for the user
      const { data: latestVersion, error: fetchError } = await supabase
        .from('Document')
        .select('id, createdAt, updatedAt, title, kind') // Select necessary fields
        .eq('id', id)
        .eq('userId', currentUserId)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle(); // Use maybeSingle as it might not exist yet

      if (fetchError) {
        console.error('[Document API] Error fetching latest document version:', fetchError);
        return NextResponse.json({ error: 'Failed to fetch document details.' }, { status: 500 });
      }

      let updateData;
      let rpcError;

      // 2. Check if we should update the latest version or create a new one
      if (latestVersion && 
          latestVersion.updatedAt && 
          differenceInMinutes(new Date(), new Date(latestVersion.updatedAt)) < VERSION_THRESHOLD_MINUTES &&
          latestVersion.title === (title || 'Document') && // Compare incoming title
          latestVersion.kind === (kind || 'text')) { // Compare incoming kind
        
        // Update existing latest version
        console.log(`[Document API] Updating latest version for ${id} (within ${VERSION_THRESHOLD_MINUTES} mins threshold)`);
        const { data: updateResult, error: updateRpcError } = await supabase.rpc('update_latest_document_version', {
          p_id: id,
          p_user_id: currentUserId,
          p_content: content || '',
        });
        updateData = updateResult;
        rpcError = updateRpcError;
        if (rpcError) console.error('[Document API] Error calling update_latest_document_version RPC:', rpcError);

      } else {
        // Create new version (either no recent version, time threshold exceeded, or title/kind changed)
        console.log(`[Document API] Creating new version for ${id} (threshold exceeded or metadata changed)`);
        
        // Verify chatId exists if provided (moved here as it's only needed for new versions)
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
            console.warn(`[Document API] Chat with ID ${chatId} not found, creating new document version without chat link`);
          }
        }
        
        const { data: createResult, error: createRpcError } = await supabase.rpc('create_new_document_version', {
          p_id: id,
          p_user_id: currentUserId,
          p_title: title || 'Document',
          p_content: content || '',
          p_kind: kind || 'text',
          p_chat_id: finalChatId,
        });
        updateData = createResult;
        rpcError = createRpcError;
        if (rpcError) console.error('[Document API] Error calling create_new_document_version RPC:', rpcError);
      }

      // --- Error Handling & Response (Common for both RPC calls) ---
      if (rpcError) {
        // Check if the error is due to the function not returning rows (e.g., permission issue or internal error)
        if (rpcError.code === 'PGRST116' || rpcError.message.includes('returned no rows')) { // PGRST116 or empty return
          // Attempt to fetch the document to verify ownership and existence before failing
          const { data: verifyDoc, error: verifyError } = await supabase
            .from('Document')
            .select('id, userId')
            .eq('id', id)
            .eq('userId', currentUserId)
            .limit(1) // Just need to know if one exists
            .maybeSingle();

          if (verifyError) {
            console.error('[Document API] Error verifying document after RPC failure:', verifyError);
            return NextResponse.json({ error: 'Failed to update document and verification failed.' }, { status: 500 });
          }
          
          if (!verifyDoc) {
            console.error('[Document API] Document not found or user does not own it after RPC failure.');
            return NextResponse.json({ error: 'Document not found or unauthorized.' }, { status: 404 });
          }

          // If verification passes but RPC failed, it's likely an internal RPC issue or maybe update didn't return data
          console.error('[Document API] RPC failed or returned no data despite document verification passing.');
        }
        // Return generic error for other RPC issues
        return NextResponse.json({ error: `Failed to update document via RPC: ${rpcError.message}` }, { status: 500 });
      }
      
      // RPC function returns an array, we expect one record
      if (!updateData || !Array.isArray(updateData) || updateData.length === 0) {
        console.error('[Document API] RPC function did not return the expected document data.');
        // Attempt to refetch the latest data as a fallback
        const { data: refetchedData, error: refetchError } = await supabase
            .from('Document')
            .select('*') // Select all columns
            .eq('id', id)
            .eq('userId', currentUserId)
            .order('createdAt', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (refetchError || !refetchedData) {
            console.error('[Document API] Failed to refetch document data after empty RPC response.');
            return NextResponse.json({ error: 'Failed to retrieve updated document data after RPC execution.' }, { status: 500 });
        }
        console.log(`[Document API] Successfully refetched document data after empty RPC response.`);
        return NextResponse.json(refetchedData); // Return the refetched data
      }

      console.log(`[Document API] Document processed successfully via RPC: ${id}`);
      return NextResponse.json(updateData[0]); // Return the first (and only) element from the array
      
    } catch (dbError) {
      console.error('[Document API] Database operation error:', dbError);
      const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
      return NextResponse.json({ error: `Database operation failed: ${errorMessage}` }, { status: 500 });
    }
  } catch (error) {
    console.error('[Document API] General update error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to update document: ${errorMessage}` }, { status: 500 });
  }
} 