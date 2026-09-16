import { proxyOrdersRequest } from '@/lib/ordersApiProxy';
export async function POST(request: Request) {
  return proxyOrdersRequest(request, '/api/ai/report', 'Reporting is temporarily unavailable.');
}
