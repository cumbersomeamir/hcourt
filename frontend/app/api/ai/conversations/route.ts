import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return proxyOrdersRequest(request, '/api/ai/conversations', 'Chat history is temporarily unavailable.');
}

export async function DELETE(request: Request) {
  return proxyOrdersRequest(request, '/api/ai/conversations', 'Chat history is temporarily unavailable.');
}
