import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return proxyOrdersRequest(request, '/api/cause-list/allahabad/counsel-search');
}
