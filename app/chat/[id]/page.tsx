import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { type Message } from 'ai';

import { createClient } from '@/utils/supabase/server';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';

// Type guard for message role
function isValidRole(role: string): role is Message['role'] {
  return ['user', 'assistant', 'system', 'data'].includes(role);
}

// Mark this page as dynamically rendered
export const dynamic = 'auto';
export const dynamicParams = true;

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

    // Get Supabase session
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

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

    // Convert messages using the utility function
    const uiMessages = convertToUIMessages(messagesFromDb);

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
    if (error && typeof error === 'object' && '$$typeof' in error) {
      throw error; // Re-throw React special objects
    }
    console.error('Page error:', error);
    return notFound();
  }
}
