import { GET as getWebDiary } from '@/controllers/webDiaryController';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) { return getWebDiary(request); }
