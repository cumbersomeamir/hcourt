import { NextResponse } from 'next/server';
import { buildUpstreamUrl } from '@/lib/ordersApiProxy';
import { isSameOrigin, sessionCookieName } from '@/lib/webSession';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  try {
    const { idToken } = await request.json();
    if (typeof idToken !== 'string' || !idToken || idToken.length > 10000) return NextResponse.json({ success: false, error: 'Google sign-in token is required.' }, { status: 400 });
    const upstream = await fetch(buildUpstreamUrl('/api/auth/google'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), cache: 'no-store',
    });
    const data = await upstream.json();
    if (!upstream.ok || !data.success || !data.session?.token) return NextResponse.json({ success: false, error: data.error || 'Google sign-in failed.' }, { status: upstream.ok ? 401 : upstream.status });
    const { token, user } = data.session;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    let accountResponse = await fetch(buildUpstreamUrl(`/api/users?email=${encodeURIComponent(user.email)}`), { headers, cache: 'no-store' });
    let accountData = await accountResponse.json();
    if (accountResponse.status === 404) {
      accountResponse = await fetch(buildUpstreamUrl('/api/users'), { method: 'POST', headers, body: JSON.stringify({ email: user.email, name: user.name, caseIds: [], trackedOrderCases: [] }), cache: 'no-store' });
      accountData = await accountResponse.json();
      accountData.user = { id: accountData.userId, email: user.email, name: user.name, caseIds: [], trackedOrderCases: [] };
    }
    if (!accountResponse.ok || !accountData.success || !accountData.user?.id) throw new Error('Unable to sync your account. Please try again.');
    const response = NextResponse.json({ success: true, user, account: accountData.user });
    response.headers.set('Cache-Control', 'no-store');
    response.cookies.set(sessionCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    return response;
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to sign in. Please try again.' }, { status: 500 });
  }
}
