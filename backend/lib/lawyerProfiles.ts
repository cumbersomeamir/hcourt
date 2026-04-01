import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export type LawyerProfile = {
  profileKey: string;
  userId?: string;
  email?: string;
  counselName: string;
  aliases: string[];
  chamberAliases: string[];
  enrollmentNo?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
};

export type LawyerProfileInput = {
  profileKey?: string | null;
  userId?: string | null;
  email?: string | null;
  counselName?: string | null;
  aliases?: unknown;
  chamberAliases?: unknown;
  enrollmentNo?: string | null;
};

let lawyerProfileIndexesEnsured = false;

function normalizeStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(
      new Set(
        input
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    );
  }

  if (typeof input === 'string') {
    return Array.from(
      new Set(
        input
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function normalizeProfileKey(value?: string | null): string {
  return String(value || '').trim();
}

async function getLawyerProfilesCollection() {
  const db = await getDb();
  const collection = db.collection<LawyerProfile>('lawyer_profiles');

  if (!lawyerProfileIndexesEnsured) {
    await Promise.all([
      collection.createIndex({ profileKey: 1 }, { unique: true, sparse: true }),
      collection.createIndex({ userId: 1 }, { sparse: true }),
      collection.createIndex({ updatedAt: -1 }),
    ]);
    lawyerProfileIndexesEnsured = true;
  }

  return collection;
}

export function normalizeLawyerProfileInput(input: LawyerProfileInput) {
  return {
    profileKey: normalizeProfileKey(input.profileKey),
    userId: String(input.userId || '').trim() || undefined,
    email: String(input.email || '').trim() || undefined,
    counselName: String(input.counselName || '').trim(),
    aliases: normalizeStringList(input.aliases),
    chamberAliases: normalizeStringList(input.chamberAliases),
    enrollmentNo: String(input.enrollmentNo || '').trim() || undefined,
  };
}

export function serializeLawyerProfile(profile: LawyerProfile | null) {
  if (!profile) return null;

  return {
    profileKey: profile.profileKey,
    userId: profile.userId || null,
    email: profile.email || null,
    counselName: profile.counselName,
    aliases: profile.aliases,
    chamberAliases: profile.chamberAliases,
    enrollmentNo: profile.enrollmentNo || null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    lastUsedAt: profile.lastUsedAt ? profile.lastUsedAt.toISOString() : null,
  };
}

export async function findLawyerProfile(params: {
  profileKey?: string | null;
  userId?: string | null;
  email?: string | null;
}): Promise<LawyerProfile | null> {
  const collection = await getLawyerProfilesCollection();
  const profileKey = normalizeProfileKey(params.profileKey);
  const userId = String(params.userId || '').trim();
  const email = String(params.email || '').trim();

  if (profileKey) {
    const byProfileKey = await collection.findOne({ profileKey });
    if (byProfileKey) return byProfileKey;
  }

  if (userId) {
    const byUserId = await collection.findOne({ userId });
    if (byUserId) return byUserId;
  }

  if (email) {
    const byEmail = await collection.findOne({ email });
    if (byEmail) return byEmail;
  }

  return null;
}

export async function upsertLawyerProfile(input: LawyerProfileInput): Promise<LawyerProfile> {
  const normalized = normalizeLawyerProfileInput(input);
  if (!normalized.profileKey && !normalized.userId && !normalized.email) {
    throw new Error('profileKey, userId, or email is required');
  }

  const collection = await getLawyerProfilesCollection();
  const now = new Date();
  const existing = await findLawyerProfile(normalized);

  const nextProfileKey =
    normalized.profileKey ||
    existing?.profileKey ||
    new ObjectId().toHexString();

  const nextDoc: LawyerProfile = {
    profileKey: nextProfileKey,
    userId: normalized.userId || existing?.userId,
    email: normalized.email || existing?.email,
    counselName: normalized.counselName || existing?.counselName || '',
    aliases: normalized.aliases.length > 0 ? normalized.aliases : existing?.aliases || [],
    chamberAliases:
      normalized.chamberAliases.length > 0
        ? normalized.chamberAliases
        : existing?.chamberAliases || [],
    enrollmentNo: normalized.enrollmentNo || existing?.enrollmentNo,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastUsedAt: now,
  };

  if (existing) {
    await collection.updateOne(
      { _id: (existing as LawyerProfile & { _id?: ObjectId })._id },
      { $set: nextDoc }
    );
    return nextDoc;
  }

  await collection.insertOne(nextDoc);
  return nextDoc;
}

export async function markLawyerProfileUsed(params: {
  profileKey?: string | null;
  userId?: string | null;
  email?: string | null;
}) {
  const collection = await getLawyerProfilesCollection();
  const existing = await findLawyerProfile(params);
  if (!existing) return null;

  const now = new Date();
  await collection.updateOne(
    { profileKey: existing.profileKey },
    { $set: { lastUsedAt: now, updatedAt: now } }
  );

  return { ...existing, lastUsedAt: now, updatedAt: now };
}
