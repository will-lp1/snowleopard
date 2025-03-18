import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { type Message } from 'ai';

import { createClient } from '@/utils/supabase/server';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId, getDocumentById } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { ResizablePanel } from '@/components/resizable-panel';

// Type guard for message role
function isValidRole(role: string): role is Message['role'] {
  return ['user', 'assistant', 'system', 'data'].includes(role);
}

// Mark this page as dynamically rendered
export const dynamic = 'auto';
export const dynamicParams = true;

export default async function Page(props: { 
  params: Promise<{ id: string }>,
  searchParams: { document?: string }
}) {
  try {
    const params = await props.params;
    const { id } = params;
    const documentId = props.searchParams.document;
    
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

    // If a document ID is provided, verify it exists and is accessible
    let initialDocumentId = 'init';
    if (documentId) {
      try {
        const document = await getDocumentById({ id: documentId });
        if (document && (document.userId === session?.user?.id || chat.visibility === 'public')) {
          initialDocumentId = documentId;
        }
      } catch (error) {
        console.error('Error fetching document:', error);
        // Fall back to default 'init' document ID
      }
    }

    const cookieStore = await cookies();
    const chatModelFromCookie = cookieStore.get('chat-model');
    
    const chatModel = chatModelFromCookie ? chatModelFromCookie.value : DEFAULT_CHAT_MODEL;
    const isReadonly = session?.user?.id !== chat.userId;

    return (
      <div className="flex flex-row h-full w-full">
        {/* Center panel - Artifact (always visible) */}
        <div className="flex-1 min-w-0 border-r border-border transition-all duration-200 ease-in-out">
          <AlwaysVisibleArtifact 
            chatId={id} 
            initialDocumentId={initialDocumentId}
          />
        </div>
        
        {/* Right panel - Chat */}
        <ResizablePanel 
          defaultSize={400} 
          minSize={320} 
          maxSize={600}
          className="border-l border-border transition-all duration-200"
        >
          <Chat
            id={chat.id}
            initialMessages={uiMessages}
            selectedChatModel={chatModel}
            selectedVisibilityType={chat.visibility}
            isReadonly={isReadonly}
          />
        </ResizablePanel>
        <DataStreamHandler id={id} />
      </div>
    );
  } catch (error) {
    if (error && typeof error === 'object' && '$$typeof' in error) {
      throw error; // Re-throw React special objects
    }
    console.error('Page error:', error);
    return notFound();
  }
}
