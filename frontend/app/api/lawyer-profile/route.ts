import { proxyOrdersRequest } from '@/lib/ordersApiProxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return proxyOrdersRequest(request, '/api/lawyer-profile', 'Profile service is temporarily unavailable.');
}

export async function POST(request: Request) {
  return proxyOrdersRequest(request, '/api/lawyer-profile', 'Profile service is temporarily unavailable.');
}

export const PATCH = POST;
