import { isSameOrigin, readSessionCookie } from './webSession';

const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export function buildUpstreamUrl(pathname: string, requestUrl?: string): string {
  const upstream = new URL(pathname, backendOrigin);

  if (requestUrl) {
    const incoming = new URL(requestUrl);
    incoming.searchParams.forEach((value, key) => {
      upstream.searchParams.append(key, value);
    });
  }

  return upstream.toString();
}

export async function proxyOrdersRequest(
  request: Request,
  pathname: string,
  unavailableMessage = 'Orders service is temporarily unavailable. Please retry shortly.'
): Promise<Response> {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');
  const cookieToken = readSessionCookie(request);
  const authorization = request.headers.get('authorization') || (cookieToken ? `Bearer ${cookieToken}` : null);
  if (cookieToken && !request.headers.has('authorization') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) && !isSameOrigin(request)) {
    return Response.json({ success: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (authorization) headers.set('authorization', authorization);

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    cache: 'no-store',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(95000)]),
  };

  if (method !== 'GET' && method !== 'HEAD') {
    const maxBytes = 1024 * 1024;
    if (Number(request.headers.get('content-length')) > maxBytes) return Response.json({ success: false, error: 'Request too large.' }, { status: 413 });
    const reader = request.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); return Response.json({ success: false, error: 'Request too large.' }, { status: 413 }); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      init.body = Buffer.concat(chunks);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(buildUpstreamUrl(pathname, request.url), init);
  } catch {
    return Response.json(
      {
        success: false,
        code: 'backend_unreachable',
        error: unavailableMessage,
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set('Cache-Control', 'no-store');
  const upstreamContentType = upstream.headers.get('content-type');
  const upstreamContentDisposition = upstream.headers.get('content-disposition');

  if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType);
  if (upstreamContentDisposition) {
    responseHeaders.set('content-disposition', upstreamContentDisposition);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
