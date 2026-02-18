import { NextResponse } from 'next/server';
import { getDb } from '@/models/mongodbModel';

// Server-only route configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, caseIds } = body;

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: 'Email and name are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      // Update existing user's case IDs
      await usersCollection.updateOne(
        { email },
        {
          $set: {
            caseIds: caseIds || [],
            updatedAt: new Date(),
          },
        }
      );

      return NextResponse.json({
        success: true,
        userId: existingUser._id.toString(),
        message: 'Case IDs updated',
      });
    }

    // Create new user
    const result = await usersCollection.insertOne({
      email,
      name,
      caseIds: caseIds || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      userId: result.insertedId.toString(),
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Error creating/updating user:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (!userId && !email) {
      return NextResponse.json(
        { success: false, error: 'userId or email is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const { ObjectId } = await import('mongodb');

    const query: { _id?: InstanceType<typeof ObjectId>; email?: string } = {};
    if (userId) {
      query._id = new ObjectId(userId);
    } else if (email) {
      query.email = email;
    }

    const user = await usersCollection.findOne(query);

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        caseIds: user.caseIds || [],
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, caseIds } = body;

    if (!userId && !email) {
      return NextResponse.json(
        { success: false, error: 'userId or email is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(caseIds)) {
      return NextResponse.json(
        { success: false, error: 'caseIds must be an array' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const { ObjectId } = await import('mongodb');

    const query: { _id?: InstanceType<typeof ObjectId>; email?: string } = {};
    if (userId) {
      query._id = new ObjectId(userId);
    } else if (email) {
      query.email = email;
    }

    const result = await usersCollection.updateOne(
      query,
      {
        $set: {
          caseIds,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Case IDs updated',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

