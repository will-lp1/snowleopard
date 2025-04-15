import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Fetch only the current documents for the user
    const { data, error } = await supabase
      .from('Document')
      .select('*')
      .eq('userId', user.id)
      .eq('is_current', true)
      .order('createdAt', { ascending: false });

    if (error) {
      console.error('Error fetching current documents:', error);
      return Response.json({
        success: false,
        message: 'Failed to fetch documents'
      }, { status: 500 });
    }

    return Response.json(data || [], { status: 200 });
  } catch (error) {
    console.error('Error processing request:', error);
    return Response.json({
      success: false,
      message: 'Failed to fetch documents'
    }, { status: 500 });
  }
} 