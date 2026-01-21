import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { generateExcelFromUpstream, generatePdfFromUpstream } from '@/lib/orders';
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
    const kind = (searchParams.get('kind') || '').toLowerCase(); // pdf | excel

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 });
    }
    if (kind !== 'pdf' && kind !== 'excel') {
      return NextResponse.json({ success: false, error: 'kind must be pdf or excel' }, { status: 400 });
    }

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

    const safeName = `${order.caseId || 'order'}`.replace(/[^a-z0-9\\-_.]/gi, '_');

    if (kind === 'pdf') {
      const pdf = await generatePdfFromUpstream(order.upstream);
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="orders-${safeName}.pdf"`,
        },
      });
    }

    const xlsx = await generateExcelFromUpstream({
      caseTypeLabel: order.caseTypeLabel || order.caseInfo?.caseType || 'Case',
      caseNo: String(order.caseNo || ''),
      caseYear: String(order.caseYear || ''),
      upstream: order.upstream,
    });
    return new NextResponse(xlsx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="orders-${safeName}.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

