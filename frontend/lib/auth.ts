import crypto from 'node:crypto';

export type AuthenticatedUser = {
  userId: string;
  email: string;
};

type NativeSession = AuthenticatedUser & { exp: number };

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error('Authentication service is not configured.');
  return secret;
}

export function createNativeSession(user: AuthenticatedUser) {
  const content = Buffer.from(JSON.stringify({
    ...user,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSessionSecret()).update(content).digest('base64url');
  return `${content}.${signature}`;
}

export function getAuthenticatedUser(request: Request): AuthenticatedUser | null {
  const value = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!value) return null;
  const [content, receivedSignature] = value.split('.');
  if (!content || !receivedSignature) return null;

  const expectedSignature = crypto.createHmac('sha256', getSessionSecret()).update(content).digest('base64url');
  if (
    receivedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))
  ) return null;

  try {
    const session = JSON.parse(Buffer.from(content, 'base64url').toString('utf8')) as NativeSession;
    if (!session.userId || !session.email || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return { userId: session.userId, email: session.email };
  } catch {
    return null;
  }
}
