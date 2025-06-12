import { NextRequest, NextResponse } from 'next/server';
import { publishDocument } from '../actions/publish';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return publishDocument(request, body);
  } catch (error) {
    console.error('[API /document/publish] Error:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
} 