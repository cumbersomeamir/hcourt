export const sessionCookieName = 'courtlens_session';

export function readSessionCookie(request: Request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookieName}=`))?.slice(sessionCookieName.length + 1) || null;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return false;
    return parsed.host === (request.headers.get('host') || new URL(request.url).host);
  } catch {
    return false;
  }
}
