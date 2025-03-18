import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDocumentsById, saveDocument, getDocumentsByChatId } from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Extract query parameters
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const chatId = searchParams.get('chatId');
    
    console.log('[Document API] GET request received:', { id, chatId });
    
    // Handle fetching by documentId
    if (id) {
      const documents = await getDocumentsById({ id });
      return NextResponse.json(documents);
    } 
    // Handle fetching by chatId
    else if (chatId) {
      console.log(`[Document API] Fetching documents for chatId: ${chatId}`);
      const documents = await getDocumentsByChatId({ chatId });
      return NextResponse.json(documents);
    } 
    // No valid parameters provided
    else {
      return NextResponse.json({ error: 'Missing required parameters: id or chatId' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Document API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user?.id) {
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
    
    if (!id) {
      return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
    }
    
    // Create document directly in Supabase to include chatId
    const { error } = await supabase
      .from('Document')
      .insert({
        id,
        title: title || 'Untitled Document',
        content: content || '',
        kind: kind || 'text',
        chatId: chatId || null,
        userId: session.user.id,
        createdAt: new Date().toISOString(),
      });
      
    if (error) {
      console.error('[Document API] Database error:', error);
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
    }
    
    console.log(`[Document API] Document saved successfully: ${id}, linked to chat: ${chatId || 'none'}`);
    
    return NextResponse.json({ id });
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { title, content, kind, chatId } = await request.json();
    const id = generateUUID();
    
    console.log('[Document API] Creating new document:', { 
      id, 
      title, 
      contentLength: content?.length || 0,
      kind,
      chatId: chatId || 'none'
    });
    
    // Create document directly in Supabase to include chatId
    const { error } = await supabase
      .from('Document')
      .insert({
        id,
        title: title || 'Untitled Document',
        content: content || '',
        kind: kind || 'text',
        chatId: chatId || null,
        userId: session.user.id,
        createdAt: new Date().toISOString(),
      });
      
    if (error) {
      console.error('[Document API] Database error:', error);
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
    }
    
    console.log(`[Document API] New document created: ${id}, linked to chat: ${chatId || 'none'}`);
    
    return NextResponse.json({ 
      id,
      title: title || 'Untitled Document',
      content: content || '',
      kind: kind || 'text',
      chatId: chatId || null,
      userId: session.user.id,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Document API] PUT error:', error);
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 });
  }
}
