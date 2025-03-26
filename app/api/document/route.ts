import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDocumentsById, saveDocument, getDocumentsByChatId } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', documents: [] }, { status: 401 });
    }
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const chatId = searchParams.get('chatId');
    
    console.log('[Document API] GET request received:', { id, chatId });
    
    // Validate ID to prevent "undefined" string being used
    if (id === 'undefined' || id === 'null' || id === 'init') {
      console.warn('[Document API] Invalid document ID detected:', id);
      return NextResponse.json({ error: 'Invalid document ID', documents: [] }, { status: 400 });
    }
    
    // Handle fetching by documentId
    if (id) {
      const documents = await getDocumentsById({ id });
      return NextResponse.json(documents);
    } 
    // Handle fetching by chatId - optimize by returning most recent document first
    else if (chatId) {
      console.log(`[Document API] Fetching documents for chatId: ${chatId}`);
      try {
        const documents = await getDocumentsByChatId({ chatId });
        
        // Sort documents by creation date (newest first)
        const sortedDocuments = documents.sort((a, b) => {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        return NextResponse.json(sortedDocuments);
      } catch (error) {
        console.error(`[Document API] Error fetching documents for chatId ${chatId}:`, error);
        return NextResponse.json({ error: 'Failed to fetch documents by chat ID', documents: [] }, { status: 500 });
      }
    } 
    // No valid parameters provided
    else {
      return NextResponse.json({ error: 'Missing required parameters: id or chatId', documents: [] }, { status: 400 });
    }
  } catch (error) {
    console.error('[Document API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch documents', documents: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document API] POST request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id, title, content, kind, chatId } = await request.json();
    
    console.log('[Document API] POST request received:', { 
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
        try {
          // Check if the chat exists
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
        } catch (chatCheckError) {
          console.warn(`[Document API] Error checking chat existence: ${chatId}`, chatCheckError);
        }
      }
      
      // If chatId is provided and valid, check if document exists
      if (finalChatId) {
        // First, check if this document already exists
        const { data: existingDocuments } = await supabase
          .from('Document')
          .select('id, chatId')
          .eq('id', id)
          .order('createdAt', { ascending: false })
          .limit(1);
          
        // If document exists but with a different chatId, we need to create a new version
        if (existingDocuments && existingDocuments.length > 0) {
          console.log(`[Document API] Updating document ${id} with new chat: ${finalChatId}`);
        }
      }
      
      // Create document directly in Supabase to include chatId
      const { error, data } = await supabase
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
        .select('id, title, content, kind, chatId, createdAt')
        .single();
          
      if (error) {
        console.error('[Document API] Database error:', error);
        return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
      }
      
      console.log(`[Document API] Document saved successfully: ${id}, linked to chat: ${finalChatId || 'none'}`);
      
      return NextResponse.json(data);
    } catch (dbError) {
      console.error('[Document API] Database operation error:', dbError);
      return NextResponse.json({ error: 'Database operation failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Document API] POST error:', error);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }
}

// Create a new document endpoint
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      console.warn('[Document API] PUT request unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id: providedId, title, content, kind, chatId } = await request.json();
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
    
    // Verify chatId exists if provided
    let finalChatId = null;
    if (chatId) {
      try {
        // Check if the chat exists
        const { data: chatData, error: chatError } = await supabase
          .from('Chat')
          .select('id')
          .eq('id', chatId)
          .single();
          
        if (chatData && !chatError) {
          finalChatId = chatId;
          console.log(`[Document API] Verified chat exists: ${chatId}`);
        } else {
          console.warn(`[Document API] Chat with ID ${chatId} not found, creating document without chat link`);
        }
      } catch (chatCheckError) {
        console.warn(`[Document API] Error checking chat existence: ${chatId}`, chatCheckError);
      }
    }
    
    console.log('[Document API] Creating new document:', { 
      id, 
      title, 
      contentLength: content?.length || 0,
      kind,
      chatId: finalChatId || 'none'
    });
    
    try {
      // Create document directly in Supabase to include chatId
      const { error, data } = await supabase
        .from('Document')
        .insert({
          id,
          title: title || 'Document',
          content: content || '',
          kind: kind || 'text',
          chatId: finalChatId, // Use verified chatId or null
          userId: session.user.id,
          createdAt: new Date().toISOString(),
        })
        .select('id, title, content, kind, chatId, createdAt, userId')
        .single();
        
      if (error) {
        console.error('[Document API] Database error during creation:', error);
        return NextResponse.json({ 
          error: `Failed to create document: ${error.message || 'Database error'}`
        }, { status: 500 });
      }
      
      console.log(`[Document API] New document created: ${id}, linked to chat: ${finalChatId || 'none'}`);
      
      return NextResponse.json(data);
    } catch (dbError) {
      console.error('[Document API] Database operation error:', dbError);
      return NextResponse.json({ 
        error: `Database operation failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[Document API] PUT error:', error);
    return NextResponse.json({ 
      error: `Failed to create document: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.nextUrl.toString());
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const updates = await request.json();
    
    // Make sure the user owns this document
    const { data: existingDoc, error: fetchError } = await supabase
      .from('Document')
      .select('*')
      .eq('id', id)
      .eq('userId', session.user.id)
      .single();
    
    if (fetchError || !existingDoc) {
      console.error('Error fetching document or document not found:', fetchError);
      return NextResponse.json({ 
        error: 'Document not found or access denied' 
      }, { status: 404 });
    }
    
    // Update the document
    const { data, error } = await supabase
      .from('Document')
      .update(updates)
      .eq('id', id)
      .eq('userId', session.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating document:', error);
      return NextResponse.json({ 
        error: 'Failed to update document' 
      }, { status: 500 });
    }

    return NextResponse.json({
      document: data,
      message: 'Document updated successfully'
    }, { status: 200 });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ 
      error: 'Failed to update document' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.nextUrl.toString());
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    // Delete document (Supabase will handle RLS to ensure user can only delete their own documents)
    const { error } = await supabase
      .from('Document')
      .delete()
      .eq('id', id)
      .eq('userId', session.user.id);

    if (error) {
      console.error('Error deleting document:', error);
      return NextResponse.json({ 
        error: 'Failed to delete document' 
      }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Document deleted successfully'
    }, { status: 200 });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ 
      error: 'Failed to delete document' 
    }, { status: 500 });
  }
}
