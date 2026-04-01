import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return proxyOrdersRequest(request, '/api/orders/case-types');
}
