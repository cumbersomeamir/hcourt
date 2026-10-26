import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return proxyOrdersRequest(request, '/api/auth/google', 'Sign-in service is temporarily unavailable.');
}
