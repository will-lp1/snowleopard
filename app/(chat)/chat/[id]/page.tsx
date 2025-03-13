'use client';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { type Message } from 'ai';

import { createClient } from '@/utils/supabase/server';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { type VisibilityType } from '@/components/visibility-selector';

// Type guard for message role
function isValidRole(role: string): role is Message['role'] {
  return ['user', 'assistant', 'system', 'data'].includes(role);
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
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

  const chatModel = chatModelFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <ChatClientPage
      id={chat.id}
      initialMessages={uiMessages}
      selectedChatModel={chatModel}
      selectedVisibilityType={chat.visibility as VisibilityType}
      isReadonly={session?.user?.id !== chat.userId}
    />
  );
}

'use client';

function ChatClientPage({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  return (
    <>
      <Chat
        id={id}
        initialMessages={initialMessages}
        selectedChatModel={selectedChatModel}
        selectedVisibilityType={selectedVisibilityType}
        isReadonly={isReadonly}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
