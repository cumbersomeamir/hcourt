import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyOrdersRequest(
    request,
    `/api/${path.join('/')}`,
    'Backend service is temporarily unavailable. Please retry shortly.'
  );
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
