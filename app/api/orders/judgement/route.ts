import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { downloadJudgmentAuto } from '@/lib/elegalix';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    // Require authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const indexStr = searchParams.get('index');

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 });
    }
    if (!indexStr || !/^\d+$/.test(indexStr)) {
      return NextResponse.json({ success: false, error: 'index must be a number' }, { status: 400 });
    }

    const index = parseInt(indexStr, 10);
    const db = await getDb();
    const ordersCollection = db.collection('orders');
    const { ObjectId } = await import('mongodb');

    // Only allow access to orders owned by the authenticated user
    const order = await ordersCollection.findOne({
      _id: new ObjectId(orderId),
      userId: currentUser.userId,
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const list = (order.orderJudgements || []) as Array<{ index: number; date: string; url: string }>;
    const item = list.find((x) => Number(x.index) === index);
    if (!item?.url) {
      return NextResponse.json({ success: false, error: 'Judgement link not found' }, { status: 404 });
    }

    // Extract judgmentID from URL: ...WebDownloadJudgmentDocument.do?judgmentID=12986533
    const judgmentIdMatch = item.url.match(/judgmentID=(\d+)/i);
    if (!judgmentIdMatch) {
      return NextResponse.json({ success: false, error: 'Invalid judgement URL format' }, { status: 400 });
    }
    const judgmentId = judgmentIdMatch[1];

    // Automatically solve captcha and download
    const { buf, contentType } = await downloadJudgmentAuto(judgmentId);

    const ct = String(order.caseTypeLabel || order.caseInfo?.caseType || 'case')
      .split('-')[0]
      .trim()
      .toUpperCase();
    const safeCase = `${ct}-${order.caseNo}-${order.caseYear}`.replace(/[^a-z0-9\\-_.]/gi, '_');
    const safeDate = String(item.date || '').trim().replace(/[^0-9\\-_.]/g, '') || `idx-${index}`;
    const filename = `order-judgement-${safeCase}-${safeDate}.pdf`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

