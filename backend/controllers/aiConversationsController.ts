import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import {
  deleteConversation,
  getConversation,
  getConversationOwnerKey,
  listConversations,
} from '@/lib/aiConversations';
import { getAuthenticatedUser } from '@/lib/auth';

function owner(request: Request) {
  const user = getAuthenticatedUser(request);
  return user ? getConversationOwnerKey({ userId: user.userId }) : '';
}

export async function GET(request: Request) {
  try {
    const ownerKey = owner(request);
    if (!ownerKey) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId');
    const db = await getDb();
    const result = conversationId
      ? await getConversation(db, ownerKey, conversationId)
      : await listConversations(db, ownerKey);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ownerKey = owner(request);
    const conversationId = new URL(request.url).searchParams.get('conversationId') || '';
    if (!ownerKey) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    if (!conversationId) return NextResponse.json({ success: false }, { status: 400 });
    await deleteConversation(await getDb(), ownerKey, conversationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
