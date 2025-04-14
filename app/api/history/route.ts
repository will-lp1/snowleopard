import { createClient } from '@/lib/supabase/server';
import { getDocumentsById } from '@/lib/db/queries'; // Import helper to fetch documents

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;

  // 1. Fetch recent chats with their document_context
  const { data: chats, error: chatError } = await supabase
    .from('Chat')
    .select('id, title, createdAt, userId, document_context')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(10); // Limit the number of chats fetched initially

  if (chatError) {
    console.error('Error fetching chat history:', chatError);
    return Response.json({ error: 'Failed to fetch chat history' }, { status: 500 });
  }

  // 2. Collect all unique document IDs from the contexts
  const docIds = new Set<string>();
  chats.forEach(chat => {
    const context = chat.document_context as any; // Type assertion for easier access
    if (context?.active) {
      docIds.add(context.active);
    }
    if (context?.mentioned && Array.isArray(context.mentioned)) {
      context.mentioned.forEach((id: string) => docIds.add(id));
    }
  });

  // 3. Fetch titles for these documents
  const uniqueDocIds = Array.from(docIds);
  let documentTitles: { [id: string]: string } = {};
  if (uniqueDocIds.length > 0) {
    try {
      const documents = await getDocumentsById({ ids: uniqueDocIds, userId: userId });
      documents.forEach(doc => {
        documentTitles[doc.id] = doc.title;
      });
    } catch (docError) {
      console.error('Error fetching document titles for history:', docError);
      // Proceed without titles if fetching fails
    }
  }

  // 4. Process chats, adding titles to the context for the response
  const processedChats = chats.map(chat => {
    const context = (chat.document_context || {}) as any;
    return {
      ...chat,
      document_context: {
        active: context.active,
        activeTitle: context.active ? (documentTitles[context.active] || null) : null,
        mentioned: context.mentioned || [],
        mentionedTitles: (context.mentioned || []).map((id: string) => documentTitles[id] || null),
      }
    };
  });

  return Response.json(processedChats);
}
