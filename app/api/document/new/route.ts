import { createClient } from '@/utils/supabase/server';
import { ArtifactKind } from '@/components/artifact';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const {
      id,
      chatId,
      content,
      title,
      kind,
    }: { 
      id: string;
      chatId?: string;
      content: string; 
      title: string; 
      kind: ArtifactKind 
    } = await request.json();

    // Insert document with chatId relationship
    const { data, error } = await supabase.from('Document').insert({
      id,
      chatId,
      content,
      title,
      kind,
      userId: user.id,
      createdAt: new Date().toISOString(),
    }).select().single();

    if (error) {
      console.error('Error creating document:', error);
      return Response.json({
        success: false,
        message: 'Failed to create document'
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      id: data.id,
      message: 'Document created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Error processing request:', error);
    return Response.json({ 
      success: false,
      message: 'Failed to create document'
    }, { status: 500 });
  }
} 