import { NextRequest, NextResponse } from 'next/server';
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { updateDocumentPublishSettings, getActiveSubscriptionByUserId } from "@/lib/db/queries";
import { getGT } from 'gt-next/server';

export async function publishDocument(request: NextRequest, body: any): Promise<NextResponse> {
  const readonlyHeaders = await headers();
  const requestHeaders = new Headers(readonlyHeaders);
  const session = await auth.api.getSession({ headers: requestHeaders });
  const t = await getGT();
  if (!session?.user?.id) {
    return NextResponse.json({ error: t('Unauthorized') }, { status: 401 });
  }
  const userId = session.user.id;
  
  if (process.env.STRIPE_ENABLED === 'true') {
    const subscription = await getActiveSubscriptionByUserId({ userId });
    if (!subscription) {
      return NextResponse.json({ error: t('Payment Required: publishing is pro-only') }, { status: 402 });
    }
  }
  
  const { id: documentId, visibility, author, style, slug } = body;
  if (!documentId || !slug) {
    return NextResponse.json({ error: t('Invalid parameters') }, { status: 400 });
  }

  try {
    const updatedDocument = await updateDocumentPublishSettings({ documentId, userId, visibility, author, style, slug });
    return NextResponse.json(updatedDocument);
  } catch (error: any) {
    console.error('[API /document/publish] Failed to update publish settings:', error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('already published')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || t('Failed to update publish settings') }, { status: 500 });
  }
} 