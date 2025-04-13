import { getMessagesByChatId } from '@/lib/db/queries';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return new Response('Authentication error', { status: 401 });
    }

    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 });
    }

    // Fetch messages for the specified chat
    const messages = await getMessagesByChatId({ id: chatId });

    // Format messages in the right structure for the client
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt
    }));

    return new Response(JSON.stringify(formattedMessages), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return new Response('Error fetching messages', { status: 500 });
  }
} 