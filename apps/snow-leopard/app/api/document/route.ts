import { NextRequest, NextResponse } from 'next/server';
import { createDocument } from './actions/create';
import { updateDocument } from './actions/update';
import { deleteDocument } from './actions/delete';
import { getDocuments } from './actions/get';
import { renameDocument } from './actions/rename';

export async function GET(request: NextRequest) {
  return getDocuments(request);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  return createDocument(request, body);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  if (body.id && body.title && 
      !body.content && !body.kind && !body.chatId) {
    return renameDocument(request, body);
  }
  
  return updateDocument(request, body);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  return deleteDocument(request, body);
}