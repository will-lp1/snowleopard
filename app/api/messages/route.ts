import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth"; // Import Better Auth
import { headers } from 'next/headers'; // Import headers
import { getMessagesByChatId, getChatById } from '@/lib/db/queries'; // Import Drizzle queries

export async function GET(request: Request) {
  try {
    // --- Authentication --- 
    const readonlyHeaders = await headers();
    const requestHeaders = new Headers(readonlyHeaders);
    const session = await auth.api.getSession({ headers: requestHeaders });

    if (!session?.user?.id) {
      console.error('Session error in /api/messages');
      return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
    }
    const userId = session.user.id;

    // --- Get Chat ID --- 
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    // --- Authorization (Optional but recommended) --- 
    // Verify the user owns the chat they are requesting messages for
    const chat = await getChatById({ id: chatId });
    if (!chat) {
       return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }
    if (chat.userId !== userId) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // --- Fetch Messages --- 
    const messages = await getMessagesByChatId({ id: chatId });

    // Format messages (assuming client expects this format, Drizzle returns JSON in `content`)
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content, // Client needs to handle parsing if necessary
      createdAt: msg.createdAt
    }));

    return NextResponse.json(formattedMessages);

  } catch (error) {
    console.error('Error fetching messages:', error);
    // Use NextResponse for consistency
    return NextResponse.json({ error: 'Error fetching messages' }, { status: 500 });
  }
} 