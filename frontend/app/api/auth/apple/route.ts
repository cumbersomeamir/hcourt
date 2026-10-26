import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const dynamic = 'force-dynamic';

async function proxy(request: Request) {
  const response = await proxyOrdersRequest(request, '/api/auth/apple', 'Apple sign-in is temporarily unavailable.');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export { proxy as GET, proxy as POST };
