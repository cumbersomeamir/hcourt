const backendOrigin = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

function buildUpstreamUrl(pathname: string, requestUrl?: string): string {
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

  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    cache: 'no-store',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(buildUpstreamUrl(pathname, request.url), init);
  } catch (error) {
    return Response.json(
      {
        success: false,
        code: 'backend_unreachable',
        error: unavailableMessage,
        details: error instanceof Error ? error.message : 'Unknown upstream error',
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
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
