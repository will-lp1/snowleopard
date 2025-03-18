import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const {
      id,
      title,
      visibility = 'private'
    }: { 
      id: string;
      title: string;
      visibility?: 'private' | 'public';
    } = await request.json();

    // Insert new chat
    const { data, error } = await supabase.from('Chat').insert({
      id,
      title,
      userId: user.id,
      visibility,
      createdAt: new Date().toISOString(),
    }).select().single();

    if (error) {
      console.error('Error creating chat:', error);
      return Response.json({
        success: false,
        message: 'Failed to create chat'
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      id: data.id,
      message: 'Chat created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Error processing request:', error);
    return Response.json({ 
      success: false,
      message: 'Failed to create chat'
    }, { status: 500 });
  }
} 