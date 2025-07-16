import { NextRequest, NextResponse } from 'next/server';
import { publishDocument } from '../actions/publish';
import { getGT } from 'gt-next/server';

export async function POST(request: NextRequest) {
  const t = await getGT();
  let body: any;
  try {
    body = await request.json();
  } catch (error: any) {
    console.error('[API /document/publish] Invalid JSON:', error);
    return NextResponse.json({ error: t('Invalid JSON body') }, { status: 400 });
  }
  try {
    return await publishDocument(request, body);
  } catch (error: any) {
    console.error('[API /document/publish] Error handling publish:', error);
    return NextResponse.json({ error: error.message || t('Error publishing document') }, { status: 500 });
  }
} 