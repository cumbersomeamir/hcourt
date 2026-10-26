import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  return proxyOrdersRequest(request, '/api/account', 'Account service is temporarily unavailable.');
}
