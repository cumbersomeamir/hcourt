import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { isSameOrigin, readSessionCookie, sessionCookieName } from '@/lib/webSession';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = getAuthenticatedUser(request);
    const response = NextResponse.json({ success: true, user, googleClientId: process.env.GOOGLE_WEB_CLIENT_ID || null }, { headers: { 'Cache-Control': 'no-store' } });
    if (!user && readSessionCookie(request)) response.cookies.set(sessionCookieName, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Sign-in is temporarily unavailable.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  const response = NextResponse.json({ success: true });
  response.cookies.set(sessionCookieName, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
