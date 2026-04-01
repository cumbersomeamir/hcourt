import { NextResponse } from 'next/server';
import { runAiAssistantChat } from '@/lib/aiAssistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await runAiAssistantChat({
      message: String(body.message || ''),
      history: Array.isArray(body.history) ? body.history : [],
      clientState: body.clientState,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
