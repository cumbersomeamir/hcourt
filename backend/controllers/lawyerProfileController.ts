import { readRequestJson } from '@/lib/requestSecurity';
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
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const profile = await findLawyerProfile({
      profileKey: null,
      userId: user.userId,
      email: user.email,
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
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const body = await readRequestJson(request, 20000);
    const profile = await upsertLawyerProfile({
      profileKey: null,
      userId: user.userId,
      email: user.email,
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
