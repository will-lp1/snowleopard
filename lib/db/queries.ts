import 'server-only';
import { createClient } from '@/utils/supabase/server';
import type { Database } from '@/utils/supabase/database.types';
import type { ArtifactKind } from '@/components/artifact';
import { cookies } from 'next/headers';

type Tables = Database['public']['Tables'];
type Chat = Tables['Chat']['Row'];
type Message = Tables['Message']['Row'];
type Document = Tables['Document']['Row'];
type Suggestion = Tables['Suggestion']['Row'];
type Vote = Tables['Vote']['Row'];

interface MessageContent {
  type: 'text' | 'tool_call' | 'tool_result';
  content: any;
  order: number;
}

interface SaveMessageContentParams {
  messageId: string;
  contents: MessageContent[];
}

export async function getUser(email: string) {
  const supabase = await createClient();
  const { data: user, error } = await supabase
    .from('auth.users')
    .select()
    .eq('email', email)
    .single();

  if (error) throw error;
  return user;
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from('Chat').insert({
    id,
    userId,
    title,
    createdAt: new Date().toISOString(),
  });

  if (error) {
    console.error('Error saving chat:', error);
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  const supabase = await createClient();
  const { error } = await supabase.from('Chat').delete().eq('id', id);

  if (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }): Promise<Chat[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Chat')
    .select()
    .eq('userId', id)
    .order('createdAt', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getChatById({ id }: { id: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Chat')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching chat:', error);
    return null;
  }

  return data;
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  const supabase = await createClient();
  const { error } = await supabase.from('Message').insert(messages);

  if (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  const supabase = await createClient();
  
  // Get messages and their content
  const { data, error } = await supabase
    .from('Message')
    .select(`
      *,
      MessageContent (
        type,
        content,
        order
      )
    `)
    .eq('chatId', id)
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }

  // Transform the data to combine message content
  return (data || []).map(message => {
    // If message has content entries
    if (message.MessageContent && message.MessageContent.length > 0) {
      // Sort by order
      const sortedContent = message.MessageContent.sort((a: any, b: any) => a.order - b.order);
      
      // Process each content entry
      const processedContent = sortedContent.map((mc: any) => {
        // Check if content is a JSON string
        if (typeof mc.content === 'string') {
          try {
            // Try to parse as JSON
            const parsed = JSON.parse(mc.content);
            // Return the parsed object with correct type
            return { type: mc.type, ...parsed };
          } catch (e) {
            // If not parseable, treat as text
            return { type: mc.type, text: mc.content };
          }
        }
        // Return non-string content
        return { type: mc.type, ...mc.content };
      });
      
      return {
        ...message,
        content: processedContent
      };
    }
    
    // If no MessageContent, return original message
    return message;
  });
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  const supabase = await createClient();
  const { data: existingVote, error: fetchError } = await supabase
    .from('Vote')
    .select()
    .eq('messageId', messageId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

  if (existingVote) {
    const { error } = await supabase
      .from('Vote')
      .update({ isUpvoted: type === 'up' })
      .eq('messageId', messageId)
      .eq('chatId', chatId);

    if (error) throw error;
  } else {
    const { error } = await supabase.from('Vote').insert({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });

    if (error) throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }): Promise<Vote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Vote')
    .select()
    .eq('chatId', id);

  if (error) throw error;
  return data;
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from('Document').insert({
    id,
    title,
    kind,
    content,
    userId,
    createdAt: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function getDocumentsById({ id }: { id: string }): Promise<Document[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Document')
    .select()
    .eq('id', id)
    .order('createdAt', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getDocumentById({ id }: { id: string }): Promise<Document> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Document')
    .select()
    .eq('id', id)
    .order('createdAt', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('Document')
    .delete()
    .eq('id', id)
    .gt('createdAt', timestamp.toISOString());

  if (error) throw error;
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from('Suggestion').insert(suggestions);
  if (error) throw error;
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}): Promise<Suggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Suggestion')
    .select()
    .eq('documentId', documentId);

  if (error) throw error;
  return data;
}

export async function getMessageById({ id }: { id: string }): Promise<Message> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Message')
    .select()
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  const supabase = await createClient();
  const { data: messagesToDelete, error: fetchError } = await supabase
    .from('Message')
    .select('id')
    .eq('chatId', chatId)
    .gte('createdAt', timestamp.toISOString());

  if (fetchError) throw fetchError;

  if (messagesToDelete.length > 0) {
    const messageIds = messagesToDelete.map((message) => message.id);

    const { error: voteError } = await supabase
      .from('Vote')
      .delete()
      .eq('chatId', chatId)
      .in('messageId', messageIds);

    if (voteError) throw voteError;

    const { error: messageError } = await supabase
      .from('Message')
      .delete()
      .eq('chatId', chatId)
      .in('id', messageIds);

    if (messageError) throw messageError;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('Chat')
    .update({ visibility })
    .eq('id', chatId);

  if (error) throw error;
}

export async function saveMessageContent({ messageId, contents }: SaveMessageContentParams) {
  const supabase = await createClient();

  // Insert all content entries for the message
  const { error } = await supabase
    .from('MessageContent')
    .insert(
      contents.map((content) => ({
        messageId,
        type: content.type,
        content: content.content,
        order: content.order,
      }))
    );

  if (error) {
    console.error('Error saving message content:', error);
    throw error;
  }
}
