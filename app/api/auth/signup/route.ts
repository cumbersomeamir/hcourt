import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { generateToken, setAuthCookie } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { success: false, error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await usersCollection.insertOne({
      email: email.toLowerCase(),
      name,
      passwordHash,
      caseIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const token = generateToken({
      userId: result.insertedId.toString(),
      email: email.toLowerCase(),
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: result.insertedId.toString(),
        email: email.toLowerCase(),
        name,
      },
    });

    response.headers.set('Set-Cookie', setAuthCookie(token));

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Signup failed' },
      { status: 500 }
    );
  }
}
