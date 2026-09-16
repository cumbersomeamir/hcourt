import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function DELETE(request: Request) {
  const user = getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const db = await getDb();
  await Promise.all([
    db.collection('users').deleteMany({ $or: [{ userId: user.userId }, { email: user.email }] }),
    db.collection('lawyer_profiles').deleteMany({ $or: [{ userId: user.userId }, { email: user.email }] }),
    db.collection('ai_conversations').deleteMany({ ownerKey: { $in: [user.userId.toLowerCase(), user.email.toLowerCase()] } }),
    db.collection('ai_chat_runs').deleteMany({ userId: user.userId }),
  ]);
  return NextResponse.json({ success: true });
}
