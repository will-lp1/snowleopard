import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { type Message } from 'ai';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { getSession } from '@/app/(auth)/auth';

// Type guard for message role
function isValidRole(role: string): role is Message['role'] {
  return ['user', 'assistant', 'system', 'data'].includes(role);
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;
    
    // Get chat and handle potential errors
    const chat = await getChatById({ id }).catch(error => {
      console.error('Error fetching chat:', error);
      return null;
    });

    if (!chat) {
      return notFound();
    }

    const session = await getSession();

    if (chat.visibility === 'private') {
      if (!session || !session.user) {
        return notFound();
      }

      if (session.user.id !== chat.userId) {
        return notFound();
      }
    }

    // Get messages and handle potential errors
    const messagesFromDb = await getMessagesByChatId({ id }).catch(error => {
      console.error('Error fetching messages:', error);
      return [];
    });

    // Convert messages with proper date objects and validate roles
    const uiMessages = messagesFromDb.map(msg => {
      const role = isValidRole(msg.role) ? msg.role : 'user'; // Default to user if invalid role
      return {
        ...msg,
        role,
        createdAt: new Date(msg.createdAt),
        content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content
      };
    });

    const cookieStore = await cookies();
    const chatModelFromCookie = cookieStore.get('chat-model');

    if (!chatModelFromCookie) {
      return (
        <>
          <Chat
            id={chat.id}
            initialMessages={uiMessages}
            selectedChatModel={DEFAULT_CHAT_MODEL}
            selectedVisibilityType={chat.visibility}
            isReadonly={session?.user?.id !== chat.userId}
          />
          <DataStreamHandler id={id} />
        </>
      );
    }

    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={uiMessages}
          selectedChatModel={chatModelFromCookie.value}
          selectedVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
        />
        <DataStreamHandler id={id} />
      </>
    );
  } catch (error) {
    console.error('Page error:', error);
    return notFound();
  }
}
