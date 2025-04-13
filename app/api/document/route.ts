import { NextRequest, NextResponse } from 'next/server';
import { createDocument } from './actions/create';
import { updateDocument } from './actions/update';
import { deleteDocument } from './actions/delete';
import { getDocuments } from './actions/get';
import { renameDocument } from './actions/rename';

// All document related actions are handled here
export async function GET(request: NextRequest) {
  return getDocuments(request);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  return createDocument(request, body);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (body.id && body.title && 
      !body.content && !body.kind && !body.chatId) {
    console.log('[Document API] Detected rename operation');
    return renameDocument(request, body);
  }
  
  return updateDocument(request, body);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  return deleteDocument(request, body);
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
