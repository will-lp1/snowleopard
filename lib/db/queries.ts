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
  chatId, // Added optional chatId
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
  chatId?: string | null; // Make it optional
}): Promise<(typeof schema.Document.$inferSelect)> {
  try {
    const now = new Date();
    const newVersionData = {
      id,
      title,
      kind: kind as typeof schema.artifactKindEnum.enumValues[number], // Cast kind to enum type
      content,
      userId,
      chatId: chatId || null, // Use provided chatId or null
      is_current: true, // New versions are always current when saved via this function
      createdAt: now.toISOString(), // FIX: Convert to ISO string
      updatedAt: now.toISOString(), // FIX: Convert to ISO string
    };

    const inserted = await db
      .insert(schema.Document)
      .values(newVersionData)
      .returning();

    console.log(`[DB Query - saveDocument] Saved new version for doc ${id}, user ${userId}`);
    if (!inserted || inserted.length === 0) {
        throw new Error("Failed to insert new document version or retrieve the inserted data.");
    }
    return inserted[0];
  } catch (error) {
    console.error(`[DB Query - saveDocument] Error saving new version for doc ${id}, user ${userId}:`, error);
    throw new Error(`Failed to save document version: ${error instanceof Error ? error.message : String(error)}`);
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
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.Document)
      .where(and(
        eq(schema.Document.id, documentId),
        eq(schema.Document.userId, userId)
      ))
      .limit(1); // Optimization

    return result[0]?.count > 0;
  } catch (error) {
    console.error(`[DB Query - checkDocumentOwnership] Error checking ownership for doc ${documentId}, user ${userId}:`, error);
    // Assume false on error to be safe
    return false;
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
    await db
      .update(schema.Document)
      .set({ is_current: false })
      .where(and(
        eq(schema.Document.id, documentId),
        eq(schema.Document.userId, userId)
        // No need to check is_current here, set all to false
      ));
    console.log(`[DB Query - setOlderVersionsNotCurrent] Marked older versions of doc ${documentId} for user ${userId} as not current.`);
  } catch (error) {
    console.error(`[DB Query - setOlderVersionsNotCurrent] Error marking older versions for doc ${documentId}, user ${userId}:`, error);
    throw new Error(`Failed to mark older document versions as not current: ${error instanceof Error ? error.message : String(error)}`);
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

/**
 * Fetches the single currently active version of a document for a user.
 */
export async function getCurrentDocumentVersion({ 
  userId, 
  documentId 
}: { 
  userId: string; 
  documentId: string 
}): Promise<(typeof schema.Document.$inferSelect) | null> {
  try {
    const results = await db
      .select()
      .from(schema.Document)
      .where(and(
        eq(schema.Document.id, documentId),
        eq(schema.Document.userId, userId),
        eq(schema.Document.is_current, true)
      ))
      .limit(1); // Should only ever be one current version

    return results[0] || null;
  } catch (error) {
    console.error(`[DB Query - getCurrentDocumentVersion] Error fetching current version for doc ${documentId}, user ${userId}:`, error);
    throw new Error(`Failed to fetch current document version: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Updates the content and timestamp of the currently active document version.
 */
export async function updateCurrentDocumentVersion({
  userId,
  documentId,
  content,
}: {
  userId: string;
  documentId: string;
  content: string;
}): Promise<(typeof schema.Document.$inferSelect) | null> {
  try {
    const updatedTimestamp = new Date(); // Use current time for updatedAt
    
    // Update the document where id, userId match and is_current is true
    const updatedDocs = await db
      .update(schema.Document)
      .set({ 
        content: content, 
        updatedAt: updatedTimestamp.toISOString() // FIX: Convert to ISO string
      })
      .where(and(
        eq(schema.Document.id, documentId),
        eq(schema.Document.userId, userId),
        eq(schema.Document.is_current, true) 
      ))
      .returning(); // Return the updated record
      
    if (updatedDocs.length === 0) {
        console.warn(`[DB Query - updateCurrentDocumentVersion] No current document found to update for doc ${documentId}, user ${userId}.`);
        // Attempt to fetch any version to check for ownership/existence issues
        const anyVersionExists = await db.select({ id: schema.Document.id })
                                       .from(schema.Document)
                                       .where(and(eq(schema.Document.id, documentId), eq(schema.Document.userId, userId)))
                                       .limit(1);
        if (anyVersionExists.length === 0) {
            throw new Error('Document not found or unauthorized.');
        } else {
            throw new Error('Failed to update the current document version. It might have been changed or deleted.');
        }
    }
      
    console.log(`[DB Query - updateCurrentDocumentVersion] Updated content for current version of doc ${documentId}, user ${userId}`);
    return updatedDocs[0];

  } catch (error) {
    console.error(`[DB Query - updateCurrentDocumentVersion] Error updating current version for doc ${documentId}, user ${userId}:`, error);
    // Rethrow specific errors or a generic one
     if (error instanceof Error && (error.message === 'Document not found or unauthorized.' || error.message.startsWith('Failed to update'))) {
        throw error;
    }
    throw new Error(`Failed to update current document version: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Checks if a Chat exists with the given ID.
 */
export async function getChatExists({ chatId }: { chatId: string }): Promise<boolean> {
  try {
    // Basic UUID validation before querying
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!chatId || !uuidRegex.test(chatId)) {
      console.warn(`[DB Query - getChatExists] Invalid chat ID format provided: ${chatId}`);
      return false;
    }
  
    const result = await db
      .select({ id: schema.Chat.id })
      .from(schema.Chat)
      .where(eq(schema.Chat.id, chatId))
      .limit(1);
      
    return result.length > 0;
  } catch (error) {
    console.error(`[DB Query - getChatExists] Error checking chat ${chatId}:`, error);
    // Decide if error means "doesn't exist" or "throw"
    // Let's assume error means we can't confirm existence, so return false
    return false; 
  }
}

/**
 * Orchestrates creating a new document version:
 * 1. Marks all existing versions as not current.
 * 2. Saves the new version data as the current one.
 */
export async function createNewDocumentVersion({
  id,
  title,
  kind,
  content,
  userId,
  chatId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
  chatId?: string | null;
}): Promise<(typeof schema.Document.$inferSelect)> {
   try {
    // 1. Mark older versions as not current
    await setOlderVersionsNotCurrent({ userId, documentId: id });
    
    // 2. Save the new version (is_current defaults to true in saveDocument)
    const newDocument = await saveDocument({
      id: id,
      title: title,
      content: content,
      kind: kind,
      userId: userId,
      chatId: chatId, 
    });
    
    console.log(`[DB Query - createNewDocumentVersion] Successfully created new version for doc ${id}, user ${userId}`);
    return newDocument;
    
  } catch (error) {
    console.error(`[DB Query - createNewDocumentVersion] Error creating new version for doc ${id}, user ${userId}:`, error);
    throw new Error(`Failed to create new document version: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the most recent version of a document by its ID, regardless of is_current status.
 * Useful for fetching the very latest record after an update or creation.
 */
export async function getLatestDocumentById({ id }: { id: string }): Promise<(typeof schema.Document.$inferSelect) | null> {
  // FIX: Reimplemented using Drizzle
  try {
    // Validate document ID
    if (!id || id === 'undefined' || id === 'null' || id === 'init') {
      console.warn(`[DB Query - getLatestDocumentById] Invalid document ID provided: ${id}`);
      throw new Error(`Invalid document ID: ${id}`);
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.warn(`[DB Query - getLatestDocumentById] Document ID is not a valid UUID format: ${id}`);
      throw new Error(`Invalid document ID format: ${id}`);
    }
    
    // Fetch the latest version based on creation time using Drizzle
    const data = await db
      .select()
      .from(schema.Document)
      .where(eq(schema.Document.id, id)) 
      .orderBy(desc(schema.Document.createdAt))
      .limit(1);

    if (!data || data.length === 0) {
      // This is okay, might be a new document being created
      console.log(`[DB Query - getLatestDocumentById] No document found with ID: ${id}`);
      return null; 
    }
    
    return data[0]; // Return the latest document found

  } catch (error) {
    console.error(`[DB Query - getLatestDocumentById] Error fetching document with ID ${id}:`, error);
    // Rethrow validation/DB errors specifically
    if (error instanceof Error && (error.message.includes('Invalid document ID') || error.message.includes('format'))) {
       throw error; 
    }
    // For other errors (like DB connection issues), maybe throw a generic error or return null depending on desired behavior
    // Returning null to align with maybeSingle() behavior in case of non-validation errors
    console.error('[DB Query - getLatestDocumentById] Non-validation error encountered, returning null.');
    return null; 
  }
}

