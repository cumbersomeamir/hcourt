import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getAuthenticatedUser } from '@/lib/auth';
import { revokeAppleAccess } from '@/lib/appleAuth';

export async function requestDeletion(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Valid email is required.' }, { status: 400 });
    }
    await (await getDb()).collection('account_deletion_requests').updateOne(
      { email, status: 'pending' },
      { $set: { email, status: 'pending', requestedAt: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Request failed.' }, { status: 500 });
  }
}

export async function deleteAccount(request: Request) {
  const user = getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  if (user.userId.startsWith('apple:')) {
    try {
      await revokeAppleAccess(user.userId);
    } catch {
      return NextResponse.json({ success: false, error: 'Apple access could not be revoked. Please sign in again and retry deletion.' }, { status: 502 });
    }
  }
  await Promise.all([
    db.collection('users').deleteMany({ $or: [{ userId: user.userId }, { email: user.email }] }),
    db.collection('lawyer_profiles').deleteMany({ $or: [{ userId: user.userId }, { email: user.email }] }),
    db.collection('ai_conversations').deleteMany({ ownerKey: { $in: [user.userId.toLowerCase(), user.email.toLowerCase()] } }),
    db.collection('ai_chat_runs').deleteMany({ userId: user.userId }),
  ]);
  await db.collection('apple_accounts').deleteMany({ userId: user.userId });
  return NextResponse.json({ success: true });
}

export async function reportAiResponse(request: Request) {
  try {
    const body = await request.json();
    const content = String(body.content || '').trim().slice(0, 10000);
    if (!content) return NextResponse.json({ success: false }, { status: 400 });
    const user = getAuthenticatedUser(request);
    await (await getDb()).collection('ai_response_reports').insertOne({
      responseId: String(body.responseId || '').trim() || null,
      conversationId: String(body.conversationId || '').trim() || null,
      content,
      reason: String(body.reason || 'inappropriate_or_incorrect').slice(0, 200),
      userId: user?.userId || null,
      createdAt: new Date(),
      status: 'open',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Report failed.' }, { status: 500 });
  }
}
