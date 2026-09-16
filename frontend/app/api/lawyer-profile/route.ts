import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function serialize(profile: Record<string, unknown> | null) {
  if (!profile) return null;
  return {
    profileKey: profile.profileKey,
    userId: profile.userId || null,
    email: profile.email || null,
    counselName: profile.counselName || '',
    aliases: profile.aliases || [],
    chamberAliases: profile.chamberAliases || [],
    enrollmentNo: profile.enrollmentNo || null,
  };
}

export async function GET(request: Request) {
  try {
    const user = getAuthenticatedUser(request);
    const params = new URL(request.url).searchParams;
    const clauses: Record<string, string>[] = [];
    if (user?.userId) clauses.push({ userId: user.userId });
    if (user?.email) clauses.push({ email: user.email });
    if (!user && params.get('profileKey')) clauses.push({ profileKey: params.get('profileKey')! });
    if (!user && params.get('userId')) clauses.push({ userId: params.get('userId')! });
    const profile = clauses.length
      ? await (await getDb()).collection('lawyer_profiles').findOne({ $or: clauses })
      : null;
    return NextResponse.json({ success: true, profile: serialize(profile) });
  } catch {
    return NextResponse.json({ success: false, error: 'Profile could not be loaded.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json();
    const profileKey = String(body.profileKey || '').trim() || crypto.randomUUID();
    const userId = user?.userId || String(body.userId || '').trim() || undefined;
    const email = user?.email || String(body.email || '').trim() || undefined;
    if (!userId && !email && !profileKey) {
      return NextResponse.json({ success: false, error: 'Profile identity is required.' }, { status: 400 });
    }

    const collection = (await getDb()).collection('lawyer_profiles');
    const identity = userId ? { userId } : email ? { email } : { profileKey };
    const now = new Date();
    await collection.updateOne(identity, {
      $set: {
        profileKey,
        userId,
        email,
        counselName: String(body.counselName || '').trim(),
        aliases: stringList(body.aliases),
        chamberAliases: stringList(body.chamberAliases),
        enrollmentNo: String(body.enrollmentNo || '').trim() || null,
        updatedAt: now,
        lastUsedAt: now,
      },
      $setOnInsert: { createdAt: now },
    }, { upsert: true });
    const profile = await collection.findOne(identity);
    return NextResponse.json({ success: true, profile: serialize(profile) });
  } catch {
    return NextResponse.json({ success: false, error: 'Profile could not be saved.' }, { status: 500 });
  }
}

export const PATCH = POST;
