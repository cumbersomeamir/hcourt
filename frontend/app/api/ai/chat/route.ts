import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return proxyOrdersRequest(request, '/api/ai/chat', 'AI chat is temporarily unavailable.');
}
