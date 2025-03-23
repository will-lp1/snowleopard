import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { AlwaysVisibleArtifact } from '@/components/always-visible-artifact';
import { ResizablePanel } from '@/components/resizable-panel';

export default async function Page() {
  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');
  const chatModel = modelIdFromCookie ? modelIdFromCookie.value : DEFAULT_CHAT_MODEL;

  return (
    <>
      <div className="flex flex-row h-dvh w-full">
        {/* Center panel - Artifact (always visible) */}
        <div className="flex-1 border-r dark:border-zinc-700 border-border">
          <AlwaysVisibleArtifact chatId={id} />
        </div>
        
        {/* Resizable Chat Panel */}
        <ResizablePanel defaultSize={400} minSize={300} maxSize={600} side="right">
          <Chat
            key={id}
            id={id}
            initialMessages={[]}
            selectedChatModel={chatModel}
            selectedVisibilityType="private"
            isReadonly={false}
          />
        </ResizablePanel>
      </div>
      <DataStreamHandler id={id} />
    </>
  );
}
