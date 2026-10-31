import { rateLimit, readRequestJson } from '@/lib/requestSecurity';
import { OAuth2Client } from 'google-auth-library';
import { NextResponse } from 'next/server';
import { createNativeSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const limited = await rateLimit('google-auth', 120);
    if (limited) return limited;
    const clientId = process.env.GOOGLE_WEB_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error('GOOGLE_WEB_CLIENT_ID is not configured.');
    }
    const androidClientId = process.env.GOOGLE_ANDROID_WEB_CLIENT_ID?.trim();

    const { idToken } = await readRequestJson(request, 15000);
    if (typeof idToken !== 'string' || !idToken.trim()) {
      return NextResponse.json({ success: false, error: 'Google ID token is required.' }, { status: 400 });
    }

    const ticket = await new OAuth2Client().verifyIdToken({
      idToken,
      audience: androidClientId ? [clientId, androidClientId] : clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      return NextResponse.json({ success: false, error: 'A verified Google email is required.' }, { status: 401 });
    }

    const user = {
      userId: `google:${payload.sub}`,
      email: payload.email,
    };
    return NextResponse.json({
      success: true,
      session: {
        token: createNativeSession(user),
        user: {
          id: user.userId,
          email: user.email,
          name: payload.name || payload.email,
          picture: payload.picture || null,
        },
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Google sign-in failed.' },
      { status: 401 }
    );
  }
}
