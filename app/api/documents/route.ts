import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Fetch all documents for the current user
    const { data, error } = await supabase
      .from('Document')
      .select('*')
      .eq('userId', user.id)
      .order('createdAt', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return Response.json({ 
        success: false, 
        message: 'Failed to fetch documents' 
      }, { status: 500 });
    }

    // Deduplicate documents - keep only the latest version of each document
    const uniqueDocuments = new Map();
    data.forEach(doc => {
      // Only add if we haven't seen this ID yet (first one is the latest since we're sorting by createdAt desc)
      if (!uniqueDocuments.has(doc.id)) {
        uniqueDocuments.set(doc.id, doc);
      }
    });

    return Response.json(Array.from(uniqueDocuments.values()), { status: 200 });
  } catch (error) {
    console.error('Error processing request:', error);
    return Response.json({ 
      success: false, 
      message: 'Failed to fetch documents' 
    }, { status: 500 });
  }
} 