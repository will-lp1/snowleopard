import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth"; // Import Better Auth instance
import { headers } from 'next/headers'; // Import headers for session retrieval
import { getAllDocumentsByUserId } from '@/lib/db/queries'; // Import the new Drizzle query

export async function GET(request: Request) {
  // --- Authentication Check --- 
  const readonlyHeaders = await headers();
  const requestHeaders = new Headers(readonlyHeaders);
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session?.user?.id) {
    // Return NextResponse for consistency in API routes
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // --- Fetch and Process Documents --- 
  try {
    // Fetch all document versions using the new Drizzle query
    const allDocuments = await getAllDocumentsByUserId({ userId });

    // Deduplicate documents - keep only the latest version of each document
    const uniqueDocuments = new Map();
    allDocuments.forEach(doc => {
      // Only add if we haven't seen this ID yet (first one is the latest due to query ordering)
      if (!uniqueDocuments.has(doc.id)) {
        uniqueDocuments.set(doc.id, doc);
      }
    });

    // Return the latest version of each document
    return NextResponse.json(Array.from(uniqueDocuments.values()), { status: 200 });

  } catch (error) {
    console.error('Error fetching or processing documents:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to fetch documents' 
    }, { status: 500 });
  }
} 