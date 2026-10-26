import { NextResponse } from 'next/server';
import { createNativeSession } from '@/lib/auth';
import { authenticateApple, createAppleNonce } from '@/lib/appleAuth';

export async function GET() {
  try {
    return NextResponse.json({ success: true, nonce: await createAppleNonce() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Apple sign-in is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const { authorizationCode, nonce, name } = await request.json();
    if (typeof authorizationCode !== 'string' || !authorizationCode || authorizationCode.length > 4096 ||
        typeof nonce !== 'string' || !nonce || nonce.length > 4096) {
      return NextResponse.json({ success: false, error: 'Apple authorization is required.' }, { status: 400 });
    }
    const user = await authenticateApple(authorizationCode, nonce, typeof name === 'string' ? name.trim().slice(0, 200) : '');
    return NextResponse.json({ success: true, session: {
      token: createNativeSession({ userId: user.userId, email: user.email }),
      user: { id: user.userId, email: user.email, name: user.name, picture: null },
    } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Apple sign-in could not be verified. Please try again.' }, { status: 401 });
  }
}
