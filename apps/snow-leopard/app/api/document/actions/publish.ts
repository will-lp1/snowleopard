import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { updateDocumentPublishSettings } from "@/lib/db/queries";

export async function publishDocument(request: NextRequest, body: any): Promise<NextResponse> {
  const readonlyHeaders = await headers();
  const requestHeaders = new Headers(readonlyHeaders);
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  
  const { id: documentId, visibility, author, style, slug } = body;
  if (!documentId || !slug) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const updatedDocument = await updateDocumentPublishSettings({ documentId, userId, visibility, author, style, slug });
  return NextResponse.json(updatedDocument);
} 