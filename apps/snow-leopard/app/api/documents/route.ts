import { NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { headers } from 'next/headers';
import { getAllDocumentsByUserId } from '@/lib/db/queries';

export async function GET(request: Request) {
  const readonlyHeaders = await headers();
  const requestHeaders = new Headers(readonlyHeaders);
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const allDocuments = await getAllDocumentsByUserId({ userId });

    const uniqueDocuments = new Map();
    allDocuments.forEach(doc => {
      if (!uniqueDocuments.has(doc.id)) {
        uniqueDocuments.set(doc.id, doc);
      }
    });

    return NextResponse.json(Array.from(uniqueDocuments.values()), { status: 200 });

  } catch (error) {
    console.error('Error fetching or processing documents:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to fetch documents' 
    }, { status: 500 });
  }
} 