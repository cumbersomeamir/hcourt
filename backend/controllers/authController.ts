import { OAuth2Client } from 'google-auth-library';
import { NextResponse } from 'next/server';
import { createNativeSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const clientId = process.env.GOOGLE_WEB_CLIENT_ID?.trim();
    if (!clientId) {
      throw new Error('GOOGLE_WEB_CLIENT_ID is not configured.');
    }

    const { idToken } = await request.json();
    if (typeof idToken !== 'string' || !idToken.trim()) {
      return NextResponse.json({ success: false, error: 'Google ID token is required.' }, { status: 400 });
    }

    const ticket = await new OAuth2Client().verifyIdToken({
      idToken,
      audience: clientId,
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
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Google sign-in failed.' },
      { status: 401 }
    );
  }
}
