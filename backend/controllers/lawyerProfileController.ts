import { NextResponse } from 'next/server';
import {
  findLawyerProfile,
  serializeLawyerProfile,
  upsertLawyerProfile,
} from '@/lib/lawyerProfiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profile = await findLawyerProfile({
      profileKey: searchParams.get('profileKey'),
      userId: searchParams.get('userId'),
      email: searchParams.get('email'),
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
    const body = await request.json();
    const profile = await upsertLawyerProfile({
      profileKey: body.profileKey,
      userId: body.userId,
      email: body.email,
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
