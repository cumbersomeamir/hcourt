import crypto from 'node:crypto';

export type AuthenticatedUser = {
  userId: string;
  email: string;
};

type NativeSession = AuthenticatedUser & { exp: number };

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SESSION_SECRET must be at least 32 characters.');
  }
  return secret;
}

function encodeSession(session: NativeSession) {
  const content = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(content).digest('base64url');
  return `${content}.${signature}`;
}

function decodeSession(value: string): NativeSession | null {
  const [content, receivedSignature] = value.split('.');
  if (!content || !receivedSignature) return null;

  const expectedProof = crypto
    .createHmac('sha256', getSessionSecret())
    .update(content)
    .digest('base64url');
  if (
    receivedSignature.length !== expectedProof.length ||
    !crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedProof))
  ) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(content, 'base64url').toString('utf8')) as NativeSession;
    if (!session.userId || !session.email || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function createNativeSession(user: AuthenticatedUser) {
  return encodeSession({ ...user, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 });
}

export function getAuthenticatedUser(request: Request): AuthenticatedUser | null {
  const value = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = value ? decodeSession(value) : null;
  return session ? { userId: session.userId, email: session.email } : null;
}
