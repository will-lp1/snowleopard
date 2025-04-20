import 'server-only';
// Remove Supabase client import
// import { createClient } from '@/lib/supabase/server';
import { db } from './index'; // Import Drizzle client
import * as schema from './schema'; // Import Drizzle schema
import { eq, desc, asc, inArray, gt, and, sql } from 'drizzle-orm'; // Import Drizzle operators and
// Remove unused Supabase type import
// import type { Database } from '@/lib/supabase/database.types'; 
import type { ArtifactKind } from '@/components/artifact';
// Remove cookies import
// import { cookies } from 'next/headers';

// Keep existing type aliases or derive from Drizzle schema if preferred
// type Tables = Database['public']['Tables']; // Remove unused Supabase Tables type
type Chat = typeof schema.Chat.$inferSelect; // Use Drizzle type
type Message = typeof schema.Message.$inferSelect; // Use Drizzle type
type Document = typeof schema.Document.$inferSelect; // Use Drizzle type
// type Suggestion = typeof schema.suggestion.$inferSelect; // Removed Suggestion type alias
// type Feedback = typeof schema.feedback.$inferSelect; // Removed Feedback type alias

// Interface for MessageContent might need adjustments if schema changes
interface MessageContent {
  type: 'text' | 'tool_call' | 'tool_result';
  content: any;
  order: number;
}

interface SaveMessageContentParams {
  messageId: string;
  contents: MessageContent[];
}

// Remove Supabase Auth specific function
// export async function getUser(email: string) {
//   const supabase = await createClient();
//   const { data: user, error } = await supabase
//     .from('auth.users')
//     .select()
//     .eq('email', email)
//     .single();
// 
//   if (error) throw error;
//   return user;
// }

// TODO: Add local authentication logic here

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
  } | null; // Drizzle expects null for JSONB
}) {
  try {
    await db.insert(schema.Chat).values({
      id,
      userId,
      title,
      createdAt: new Date().toISOString(), // Keep using ISO string if schema expects it
      document_context,
    });
  } catch (error) {
    console.error('Error saving chat:', error);
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(schema.Chat).where(eq(schema.Chat.id, id));
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }): Promise<Chat[]> {
  try {
    const data = await db.select()
      .from(schema.Chat)
      .where(eq(schema.Chat.userId, id))
      .orderBy(desc(schema.Chat.createdAt));
    return data;
  } catch (error) {
    console.error('Error fetching chats by user ID:', error);
    throw error; // Re-throw or return empty array based on desired behavior
  }
}

export async function getChatById({ id }: { id: string }): Promise<Chat | null> {
  try {
    const data = await db.select()
      .from(schema.Chat)
      .where(eq(schema.Chat.id, id))
      .limit(1);

    return data[0] || null;
  } catch (error) {
    console.error('Error fetching chat:', error);
    return null;
  }
}

// Note: Message saving needs adjustment as `content` is json in Drizzle schema, not MessageContent relation
// This function assumes `messages` are prepared correctly according to the Drizzle schema.
export async function saveMessages({ messages }: { messages: Array<typeof schema.Message.$inferInsert> }) {
   try {
    await db.insert(schema.Message).values(messages);
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
}

// This needs significant rewrite as MessageContent is not a direct relation in Drizzle schema
// and the `content` field in `Message` table holds the JSON data directly.
// The following is a placeholder showing how to fetch Messages.
// Logic to handle JSON content parsing needs to be implemented based on application needs.
export async function getMessagesByChatId({ id }: { id: string }): Promise<Message[]> {
  try {
    const data = await db.select()
      .from(schema.Message)
      .where(eq(schema.Message.chatId, id))
      .orderBy(asc(schema.Message.createdAt));

    // TODO: Add logic here to parse message.content (JSON) if needed
    // The previous logic using MessageContent relation is removed.
    /* Example of parsing JSON content if needed:
    return data.map((message: Message) => { 
      let parsedContent = {};
      try {
        // Assuming message.content is a valid JSON string or object
        parsedContent = typeof message.content === 'string' 
          ? JSON.parse(message.content) 
          : message.content;
      } catch (e) {
        console.error('Failed to parse message content:', e);
        // Handle error, maybe return message with raw content or default
      }
      return {
        ...message,
        content: parsedContent, // Replace raw content with parsed content
      };
    });
    */

    return data;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}


export async function getMessagesByIds(ids: string[]): Promise<Message[]> {
  if (!ids.length) return [];

  try {
    const data = await db.select()
      .from(schema.Message)
      .where(inArray(schema.Message.id, ids));
    return data;
  } catch (error) {
    console.error('Error fetching messages by IDs:', error);
    throw error;
  }
}

// This function is redundant now as getMessagesByChatId/getMessagesByIds fetch the message
// with its content directly from the `message.content` column.
// export async function getMessageWithContent(message: Message) {
// ... removed ...
// }

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
  is_current = true,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string | null; // Drizzle allows null for text
  userId: string;
  is_current?: boolean; // Make optional in parameters
}) {
  try {
    // Drizzle requires both PK columns for insert if not using default
    const createdAt = new Date().toISOString();
    await db.insert(schema.Document).values({
      id,
      title,
      kind,
      content,
      userId,
      createdAt: createdAt,
      updatedAt: createdAt, // Set initial updatedAt
      is_current: is_current, // Add is_current to the inserted values
    });
  } catch (error) {
    console.error('Error saving document:', error);
    throw error;
  }
}

/**
 * Get documents by their IDs, ensuring the user has access
 */
export async function getDocumentsById({ ids, userId }: { ids: string[], userId: string }): Promise<Document[]> {
  if (!ids || ids.length === 0) {
    return []; // Return early if ids array is empty
  }
  try {
    const data = await db.select()
      .from(schema.Document)
      .where(and( // Combine conditions with and()
        eq(schema.Document.userId, userId),
        inArray(schema.Document.id, ids)
      ));
    return data || [];
  } catch (error) {
    console.error('Error fetching documents by IDs:', error);
    return [];
  }
}

/**
 * Get a single document by its ID - useful for specific lookups
 */
export async function getDocumentById({ id }: { id: string }): Promise<Document | null> { // Return null if not found
  // Keep validation logic if necessary
  if (!id || id === 'undefined' || id === 'null' || id === 'init' ||
      id === 'current document' || id === 'current document ID' ||
      id.includes('current')) {
    console.warn(`[DB Query] Invalid document ID provided: ${id}`);
    // throw new Error(`Invalid document ID: ${id}`); // Or return null
    return null;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    console.warn(`[DB Query] Document ID is not a valid UUID format: ${id}`);
    // throw new Error(`Invalid document ID format: ${id}`); // Or return null
    return null;
  }

  try {
    const data = await db.select()
      .from(schema.Document)
      .where(eq(schema.Document.id, id))
      .orderBy(desc(schema.Document.createdAt))
      .limit(1);

    if (!data || data.length === 0) {
      console.warn(`[DB Query] No document found with ID: ${id}`);
      return null;
    }

    return data[0];
  } catch (error) {
    console.error(`[DB Query] Error fetching document with ID ${id}:`, error);
    // throw error; // Re-throw or return null based on desired behavior
    return null;
  }
}

// This function logic changes as Document PK is (id, createdAt)
export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: string;
}) {
  try {
    await db.delete(schema.Document)
      .where(and( // Combine conditions with and()
        eq(schema.Document.id, id),
        gt(schema.Document.createdAt, timestamp)
      ));
  } catch (error) {
    console.error('Error deleting documents:', error);
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }): Promise<Message | null> { // Return null if not found
  try {
    const data = await db.select()
      .from(schema.Message)
      .where(eq(schema.Message.id, id))
      .limit(1);

    return data[0] || null;
  } catch (error) {
    console.error('Error fetching message by ID:', error);
    throw error; // Or return null
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: string;
}) {
  try {
    await db.delete(schema.Message)
      .where(and( // Combine conditions with and()
        eq(schema.Message.chatId, chatId),
        gt(schema.Message.createdAt, timestamp)
      ));
  } catch (error) {
    console.error('Error deleting messages:', error);
    throw error;
  }
}

// This function becomes irrelevant as message.content is handled directly in Message table
// export async function saveMessageContent({ messageId, contents }: SaveMessageContentParams) {
// ... removed ...
// }

// Function to update the document context of a chat
export async function updateChatContextQuery({
  chatId,
  userId,
  context,
}: {
  chatId: string;
  userId: string;
  context: { active?: string; mentioned?: string[] }; // Expect undefined, not null
}) {
  try {
    await db.update(schema.Chat)
      .set({ document_context: context })
      .where(
        and(
          eq(schema.Chat.id, chatId),
          eq(schema.Chat.userId, userId) // Ensure user owns the chat
        )
      );
  } catch (error) {
    console.error('Error updating chat context:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// Get a chat by ID with its messages
export async function GET(request: Request) {
  // ... existing code ...
}

// Function to get ALL document versions for a user, ordered by creation date descending
export async function getAllDocumentsByUserId({ userId }: { userId: string }): Promise<Document[]> {
  try {
    const data = await db.select()
      .from(schema.Document)
      .where(eq(schema.Document.userId, userId))
      .orderBy(desc(schema.Document.createdAt)); // Order by creation date DESC
    return data || [];
  } catch (error) {
    console.error('Error fetching all documents by user ID:', error);
    return []; // Return empty array on error
  }
}

// Function to get only the *current* document versions for a user
export async function getCurrentDocumentsByUserId({ userId }: { userId: string }): Promise<Document[]> {
  try {
    const data = await db.select()
      .from(schema.Document)
      .where(
        and(
          eq(schema.Document.userId, userId),
          eq(schema.Document.is_current, true) // Filter for is_current = true
        )
      )
      .orderBy(desc(schema.Document.createdAt)); // Order by creation date DESC
    return data || [];
  } catch (error) {
    console.error('Error fetching current documents by user ID:', error);
    return []; // Return empty array on error
  }
}

// Function to search current documents by title/content (case-insensitive)
export async function searchDocumentsByQuery({ 
  userId, 
  query, 
  limit = 5 
}: { 
  userId: string; 
  query: string; 
  limit?: number;
}): Promise<Document[]> {
  try {
    const data = await db.select()
      .from(schema.Document)
      .where(
        and(
          eq(schema.Document.userId, userId),
          eq(schema.Document.is_current, true),
          // Case-insensitive search using ilike
          sql`(${schema.Document.title} ilike ${`%${query}%`} or ${schema.Document.content} ilike ${`%${query}%`})`
        )
      )
      .orderBy(desc(schema.Document.createdAt))
      .limit(limit);
    return data || [];
  } catch (error) {
    console.error('Error searching documents by query:', error);
    return [];
  }
}

// Function to get the *current* document version by title (case-insensitive)
export async function getCurrentDocumentByTitle({ 
  userId, 
  title 
}: { 
  userId: string; 
  title: string 
}): Promise<Document | null> {
  try {
    const data = await db.select()
      .from(schema.Document)
      .where(
        and(
          eq(schema.Document.userId, userId),
          eq(schema.Document.is_current, true),
          sql`${schema.Document.title} ilike ${title}` // Case-insensitive title match
        )
      )
      .orderBy(desc(schema.Document.createdAt)) // Just in case of unlikely duplicate titles
      .limit(1);
    return data[0] || null;
  } catch (error) {
    console.error('Error fetching current document by title:', error);
    return null;
  }
}

// Function to check if a user owns ANY version of a document
export async function checkDocumentOwnership({ 
  userId, 
  documentId 
}: { 
  userId: string; 
  documentId: string 
}): Promise<boolean> {
  try {
    const data = await db.select({ id: schema.Document.id })
      .from(schema.Document)
      .where(
        and(
          eq(schema.Document.id, documentId),
          eq(schema.Document.userId, userId)
        )
      )
      .limit(1); // We only need to find one matching record
    return data.length > 0;
  } catch (error) {
    console.error('Error checking document ownership:', error);
    return false; // Assume no ownership on error
  }
}

// Function to delete ALL versions of a document owned by a specific user
export async function deleteDocumentByIdAndUserId({ 
  userId, 
  documentId 
}: { 
  userId: string; 
  documentId: string 
}): Promise<void> {
  try {
    // First, verify ownership (optional, but safer)
    const ownsDocument = await checkDocumentOwnership({ userId, documentId });
    if (!ownsDocument) {
      console.warn(`User ${userId} attempted to delete document ${documentId} they don't own.`);
      throw new Error('Unauthorized or document not found'); // Prevent deletion
    }

    // Delete all versions matching the ID and owned by the user
    await db.delete(schema.Document)
      .where(
        and(
          eq(schema.Document.id, documentId),
          eq(schema.Document.userId, userId)  
        )
      );
    console.log(`Deleted all versions of document ${documentId} for user ${userId}`);
  } catch (error) {
    console.error('Error deleting document by ID and User ID:', error);
    throw error; // Re-throw error
  }
}

// Function to set is_current = false for all older versions of a document
export async function setOlderVersionsNotCurrent({ 
  userId, 
  documentId 
}: { 
  userId: string; 
  documentId: string 
}): Promise<void> {
  try {
    // Find the timestamp of the latest version for this user and document ID
    const latestVersion = await db.select({ latestCreatedAt: schema.Document.createdAt })
      .from(schema.Document)
      .where(and(
        eq(schema.Document.id, documentId),
        eq(schema.Document.userId, userId)
      ))
      .orderBy(desc(schema.Document.createdAt))
      .limit(1);

    if (!latestVersion || latestVersion.length === 0) {
      // No versions found, nothing to update
      console.log(`[DB Query] No versions found for doc ${documentId} user ${userId} to set older as not current.`);
      return;
    }

    const latestTimestamp = latestVersion[0].latestCreatedAt;

    // Update older versions
    await db.update(schema.Document)
      .set({ is_current: false })
      .where(
        and(
          eq(schema.Document.id, documentId),
          eq(schema.Document.userId, userId),
          // Use direct SQL comparison for timestamp inequality
          sql`${schema.Document.createdAt} < ${latestTimestamp}`
          // Alternatively, if timestamps are precise and unique:
          // ne(schema.Document.createdAt, latestTimestamp) 
        )
      );
    console.log(`[DB Query] Set is_current=false for older versions of doc ${documentId} user ${userId}`);

  } catch (error) {
    console.error('Error setting older document versions not current:', error);
    throw error; // Re-throw error
  }
}

// Function to rename the title for ALL versions of a document owned by a user
export async function renameDocumentTitle({ 
  userId, 
  documentId, 
  newTitle 
}: { 
  userId: string; 
  documentId: string; 
  newTitle: string; 
}): Promise<void> {
  try {
    // First, verify ownership (optional, but safer)
    const ownsDocument = await checkDocumentOwnership({ userId, documentId });
    if (!ownsDocument) {
      console.warn(`User ${userId} attempted to rename document ${documentId} they don't own.`);
      throw new Error('Unauthorized or document not found'); // Prevent rename
    }

    // Update title for all versions matching the ID and owned by the user
    await db.update(schema.Document)
      .set({ title: newTitle, updatedAt: new Date().toISOString() }) // Also update updatedAt
      .where(
        and(
          eq(schema.Document.id, documentId),
          eq(schema.Document.userId, userId) 
        )
      );
    console.log(`Renamed document ${documentId} to "${newTitle}" for user ${userId}`);

  } catch (error) {
    console.error('Error renaming document title:', error); 
    throw error; // Re-throw error
  }
}

// --- Remove Feedback Query ---

// /**
//  * Saves feedback to the database.
//  */
// export async function saveFeedback({
//   userId, // Optional: Link feedback to the logged-in user
//   type,   // Optional: Categorize feedback (e.g., 'bug', 'feature')
//   content,
// }: {
//   userId?: string;
//   type?: string;
//   content: string;
// }): Promise<void> { 
//   try {
//     await db.insert(schema.feedback).values({
//       userId,
//       type,
//       content,
//       // createdAt is handled by defaultNow()
//     });
//     console.log('[DB Query] Saved feedback');
//   } catch (error) {
//     console.error('[DB Query] Error saving feedback:', error);
//     throw error; // Re-throw error
//   }
// }

// --- End removed Feedback Query ---

// Make sure no other code references the removed functions or types

