import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function POST(request: Request) {
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
}
