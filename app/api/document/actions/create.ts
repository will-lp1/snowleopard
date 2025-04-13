import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateUUID } from '@/lib/utils';

/**
 * Handles document creation
 */
export async function createDocument(request: NextRequest, body: any) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document API] Create request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id: providedId, title, content, kind, chatId } = body;
    
    // Generate a UUID if none provided, otherwise use the provided one
    const id = providedId || generateUUID();
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.error(`[Document API] Invalid document ID format: ${id}`);
      return NextResponse.json({ 
        error: `Invalid document ID format. Must be a valid UUID.` 
      }, { status: 400 });
    }
    
    // Check if the document already exists
    const { data: existingDoc, error: checkError } = await supabase
      .from('Document')
      .select('id, userId, createdAt')
      .eq('id', id)
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (checkError) {
      console.error('[Document API] Error checking document existence:', checkError);
      return NextResponse.json({ error: 'Database error checking document' }, { status: 500 });
    }
    
    // If document exists and user doesn't own it, return error
    if (existingDoc && existingDoc.userId !== session.user.id) {
      return NextResponse.json({ 
        error: 'Unauthorized - you do not own this document' 
      }, { status: 403 });
    }
    
    // If document exists and user owns it, delete the old version to prevent duplicates
    if (existingDoc && existingDoc.userId === session.user.id) {
      const { error: deleteError } = await supabase
        .from('Document')
        .delete()
        .eq('id', id);
      
      if (deleteError) {
        console.warn(`[Document API] Error deleting existing document before creating new one: ${deleteError.message}`);
        // Continue anyway - we'll create a new version
      } else {
        console.log(`[Document API] Deleted existing document with ID ${id} before creating new version`);
      }
    }
    
    // Verify chatId exists if provided
    let finalChatId = null;
    if (chatId) {
      const { data: chatData, error: chatError } = await supabase
        .from('Chat')
        .select('id')
        .eq('id', chatId)
        .maybeSingle();
        
      if (chatData) {
        finalChatId = chatId;
        console.log(`[Document API] Chat exists and will be linked to document: ${chatId}`);
      } else {
        // Just log a warning but continue - don't link to invalid chat
        console.warn(`[Document API] Chat ID ${chatId} not found or error occurred: ${chatError?.message}`);
      }
    }
    
    console.log('[Document API] Creating document:', { 
      id, 
      title, 
      contentLength: content?.length || 0,
      kind,
      chatId: finalChatId || 'none'
    });
    
    try {
      // --- NEW LOGIC: Call database function to handle versioning, same as update --- 
      const { data: createData, error: rpcError } = await supabase.rpc('create_new_document_version', {
        p_id: id,
        p_user_id: session.user.id,
        p_title: title || 'Document', // Use provided or default title
        p_content: content || '',       // Use provided or empty content
        p_kind: kind || 'text',       // Use provided or default kind
        p_chat_id: finalChatId,      // Use verified chat ID or null
      });

      if (rpcError) {
        console.error('[Document API] Error calling create_new_document_version RPC during creation:', rpcError);
        return NextResponse.json({ error: 'Failed to create document via RPC.' }, { status: 500 });
      }
      
      // RPC function returns an array, we expect one record for the newly created version
      if (!createData || !Array.isArray(createData) || createData.length === 0) {
        console.error('[Document API] Create RPC function did not return the expected document data.');
        return NextResponse.json({ error: 'Failed to retrieve created document data.' }, { status: 500 });
      }

      console.log(`[Document API] Document created successfully via RPC: ${id}${finalChatId ? `, linked to chat: ${finalChatId}` : ''}`);
      return NextResponse.json(createData[0]); // Return the first (and only) element from the array

      /* --- OLD LOGIC (Commented out for reference) ---
      // Create a new document
      const { error: insertError, data: insertData } = await supabase
        .from('Document')
        .insert({
          id,
          title: title || 'Document',
          content: content || '',
          kind: kind || 'text',
          chatId: finalChatId,
          userId: session.user.id,
          createdAt: new Date().toISOString(),
        })
        .select('id, title, content, kind, chatId, createdAt, userId')
        .single();
        
      if (insertError) {
        console.error('[Document API] Error creating document:', insertError);
        return NextResponse.json({ 
          error: `Failed to create document: ${insertError.message || 'Database error'}`
        }, { status: 500 });
      }
      
      console.log(`[Document API] Document created: ${id}${finalChatId ? `, linked to chat: ${finalChatId}` : ''}`);
      return NextResponse.json(insertData);
      */
    } catch (dbError) {
      console.error('[Document API] Database operation error during creation:', dbError);
      return NextResponse.json({ 
        error: `Database operation failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[Document API] Create error:', error);
    return NextResponse.json({ 
      error: `Failed to create document: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
} 