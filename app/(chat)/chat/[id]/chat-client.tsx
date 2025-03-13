'use client';

import { type Message } from 'ai';
import { type VisibilityType } from '@/components/visibility-selector';
import { Chat } from '@/components/chat';
import { DataStreamHandler } from '@/components/data-stream-handler';

export function ChatClientPage({
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