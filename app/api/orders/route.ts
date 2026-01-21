import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { fetchOrdersForStorage } from '@/lib/orders';
import { getCurrentUser } from '@/lib/auth';

function normalizeCaseIds(caseIdsParam: string | null) {
  if (!caseIdsParam) return [];
  return caseIdsParam
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);
}

async function resolveTrackedCaseIds(caseIdsParam: string | null, userId: string | null) {
  const fromParam = normalizeCaseIds(caseIdsParam);
  if (fromParam.length > 0) return fromParam;
  if (!userId) return [];

  const db = await getDb();
  const usersCollection = db.collection('users');
  const { ObjectId } = await import('mongodb');
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    if (user?.caseIds) return (user.caseIds as string[]).map((id) => id.toUpperCase());
  } catch {
    // ignore invalid ObjectId
  }
  return [];
}

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
    const caseIdsParam = searchParams.get('caseIds');
    
    // Use authenticated user's ID (ignore userId from query params for security)
    const userId = currentUser.userId;

    const trackedCaseIds = await resolveTrackedCaseIds(caseIdsParam, userId);

    const db = await getDb();
    const ordersCollection = db.collection('orders');

    // Only return orders for the authenticated user
    const query: Record<string, unknown> = {
      userId: userId,
    };
    if (trackedCaseIds.length > 0) query.caseId = { $in: trackedCaseIds };

    const orders = await ordersCollection
      .find(query)
      .sort({ fetchedAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      trackedCaseIds,
      orders: orders.map((o) => ({
        ...o,
        _id: o._id.toString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Require authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Use authenticated user's ID (ignore userId from body for security)
    const userId = currentUser.userId;

    const stored = await fetchOrdersForStorage({
      caseType: String(body.caseType || ''),
      caseNo: String(body.caseNo || ''),
      caseYear: String(body.caseYear || ''),
    });

    const db = await getDb();
    const ordersCollection = db.collection('orders');

    const doc = {
      userId: userId,
      caseId: stored.caseId,
      caseTypeValue: stored.caseTypeValue,
      caseTypeLabel: stored.caseTypeLabel,
      caseNo: stored.caseNo,
      caseYear: stored.caseYear,
      upstream: stored.upstream,
      caseInfo: stored.caseInfo,
      details: stored.details,
      orderJudgements: stored.orderJudgements || [],
      fetchedAt: new Date(stored.fetchedAt),
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    // Upsert so re-tracking refreshes content (only for this user)
    const existing = await ordersCollection.findOne({
      caseId: doc.caseId,
      userId: userId,
    });

    if (existing) {
      await ordersCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...doc,
            createdAt: existing.createdAt || new Date(),
            fetchedAt: new Date(stored.fetchedAt),
            updatedAt: new Date(),
          },
        }
      );
      return NextResponse.json({
        success: true,
        orderId: existing._id.toString(),
        order: { ...existing, ...doc, _id: existing._id.toString() },
      });
    }

    const result = await ordersCollection.insertOne(doc);
    return NextResponse.json({
      success: true,
      orderId: result.insertedId.toString(),
      order: { ...doc, _id: result.insertedId.toString() },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

