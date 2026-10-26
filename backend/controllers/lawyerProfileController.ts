import { NextResponse } from 'next/server';
import {
  findLawyerProfile,
  serializeLawyerProfile,
  upsertLawyerProfile,
} from '@/lib/lawyerProfiles';
import { getAuthenticatedUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const profile = await findLawyerProfile({
      profileKey: user ? null : searchParams.get('profileKey'),
      userId: user?.userId || searchParams.get('userId'),
      email: user?.email || searchParams.get('email'),
    });

    return NextResponse.json({
      success: true,
      profile: serializeLawyerProfile(profile),
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
    const user = getAuthenticatedUser(request);
    const body = await request.json();
    const profile = await upsertLawyerProfile({
      profileKey: user ? null : body.profileKey,
      userId: user?.userId || body.userId,
      email: user?.email || body.email,
      counselName: body.counselName,
      aliases: body.aliases,
      chamberAliases: body.chamberAliases,
      enrollmentNo: body.enrollmentNo,
    });

    return NextResponse.json({
      success: true,
      profile: serializeLawyerProfile(profile),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export const PATCH = POST;
