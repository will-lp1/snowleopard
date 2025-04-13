import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import type { ArtifactKind } from '@/components/artifact';
import { cookies } from 'next/headers';

type Tables = Database['public']['Tables'];
type Chat = Tables['Chat']['Row'];
type Message = Tables['Message']['Row'];
type Document = Tables['Document']['Row'];
type Suggestion = Tables['Suggestion']['Row'];

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
  document_context,
}: {
  id: string;
  userId: string;
  title: string;
  document_context?: {
    active?: string;
    mentioned?: string[];
  };
}) {
  const supabase = await createClient();
  const { error } = await supabase.from('Chat').insert({
    id,
    userId,
    title,
    createdAt: new Date().toISOString(),
    document_context,
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

export async function getMessagesByIds(ids: string[]): Promise<Message[]> {
  if (!ids.length) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Message')
    .select()
    .in('id', ids);

  if (error) throw error;
  return data;
}

export async function getMessageWithContent(message: Message) {
  const supabase = await createClient();
  const { data: messageContents, error } = await supabase
    .from('MessageContent')
    .select('*')
    .eq('messageId', message.id)
    .order('order', { ascending: true });

  if (error) throw error;

  if (messageContents?.length) {
    return {
      ...message,
      content: messageContents,
    };
  }

  // If no MessageContent, return original message
  return message;
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

/**
 * Get documents by their IDs, ensuring the user has access
 */
export async function getDocumentsById({ ids, userId }: { ids: string[], userId: string }): Promise<Document[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('Document')
    .select()
    .in('id', ids) // Use .in() for multiple IDs
    .eq('userId', userId); // Ensure user owns the documents

  if (error) {
    console.error('Error fetching documents by IDs:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get a single document by its ID - useful for specific lookups
 */
export async function getDocumentById({ id }: { id: string }): Promise<Document> {
  const supabase = await createClient();

  try {
    // Validate document ID with strict format checking
    if (!id) {
      console.warn(`[DB Query] Empty document ID provided`);
      throw new Error(`Invalid document ID: empty`);
    }
    
    if (id === 'undefined' || id === 'null' || id === 'init' || 
        id === 'current document' || id === 'current document ID' ||
        id.includes('current')) {
      console.warn(`[DB Query] Invalid document ID provided: ${id}`);
      throw new Error(`Invalid document ID: ${id}`);
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.warn(`[DB Query] Document ID is not a valid UUID format: ${id}`);
      throw new Error(`Invalid document ID format: ${id}`);
    }
    
    // Don't use single(), instead get all documents with this ID and take the most recent one
    const { data, error } = await supabase
      .from('Document')
      .select()
      .eq('id', id)
      .order('createdAt', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`[DB Query] Error fetching document with ID ${id}:`, error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.warn(`[DB Query] No document found with ID: ${id}`);
      throw new Error(`Document not found: ${id}`);
    }
    
    // Return the most recent document
    return data[0];
  } catch (error) {
    console.error('[DB Query] getDocumentById error:', error instanceof Error ? error.message : error);
    throw error; // Re-throw to handle in the calling code
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('Document')
    .delete()
    .eq('id', id)
    .gt('createdAt', timestamp);

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
  timestamp: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('Message')
    .delete()
    .eq('chatId', chatId)
    .gt('createdAt', timestamp);

  if (error) throw error;
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
