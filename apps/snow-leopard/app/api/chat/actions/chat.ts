'use server';

import { generateText, type UIMessage } from 'ai';
import { getTextFromMessage } from '@/lib/utils';
import { cookies } from 'next/headers';

import {
  deleteChatById,
  saveChat,
  saveMessages,
  getMessagesByChatId,
  getMessageById,
  deleteMessagesByChatIdAfterTimestamp,
} from '@/lib/db/queries';
import { myProvider } from '@/lib/ai/providers';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  if (!message) {
    return 'New Chat';
  }

  try {
    const messageText = message.parts
      ?.filter((part: any) => part.type === 'text')
      ?.map((part: any) => part.text)
      ?.join('') || '';
    
    const { text: title } = await generateText({
      model: myProvider.languageModel('title-model'),
      system: `\n
      - you will generate a short title based on the first message a user begins a conversation with
      - ensure it is not more than 80 characters long
      - the title should be a summary of the user's message
      - do not use quotes or colons`,
      prompt: messageText,
    });

    return title;
  } catch (error) {
    console.error('[generateTitleFromUserMessage] Error:', error);
    return 'New Chat';
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  if (message) {
    await deleteMessagesByChatIdAfterTimestamp({
      chatId: message.chatId,
      timestamp: message.createdAt,
    });
  }
} 