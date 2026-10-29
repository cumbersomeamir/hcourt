import { createHash, randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from './mongodb';
import { getMediaFromR2, uploadMediaToR2 } from './r2';

type Entry = { _id: string; value?: unknown; r2Key?: string; fetchedAt: Date; freshUntil: Date };
type Lease = { _id: string; owner: string; until: Date };
type Options<T> = {
  key: unknown;
  source: string;
  ttlMs: number;
  load: () => Promise<T>;
  fallback?: () => Promise<{ value: T; fetchedAt: Date } | null>;
};
const running = new Map<string, Promise<unknown>>();
let indexes: Promise<unknown> | undefined;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const leaseMs = 180000;

async function acquire(locks: Collection<Lease>, id: string, owner: string) {
  try {
    return Boolean(await locks.findOneAndUpdate(
      { _id: id, until: { $lte: new Date() } },
      { $set: { owner, until: new Date(Date.now() + leaseMs) } },
      { upsert: true, returnDocument: 'after' },
    ));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

function stamp<T>(value: T, entry: Entry): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return { ...value, servedFromCache: true, cachedAt: entry.fetchedAt.toISOString(), cacheStale: entry.freshUntil.getTime() <= Date.now() };
}

async function read<T>(entry: Entry | null): Promise<T | null> {
  if (!entry) return null;
  if (entry.value !== undefined) return entry.value as T;
  if (!entry.r2Key) return null;
  try { return JSON.parse((await getMediaFromR2(entry.r2Key)).toString('utf8')) as T; }
  catch { return null; }
}

export async function cachedCourtRequest<T>(options: Options<T>): Promise<T> {
  const id = hash(options.key);
  let db;
  try { db = await getDb(); }
  catch { throw new Error('Court cache is temporarily unavailable. Please retry shortly.'); }
  const cache = db.collection<Entry>('court_response_cache');
  const locks = db.collection<Lease>('court_request_leases');
  indexes ||= locks.createIndex({ until: 1 }, { expireAfterSeconds: 86400 }).catch(error => { indexes = undefined; throw error; });
  await indexes;
  let entry = await cache.findOne({ _id: id });
  let value: T | null = await read<T>(entry);
  if (value === null && options.fallback) {
    const fallback = await options.fallback();
    if (fallback) {
      value = fallback.value;
      entry = { _id: id, value, fetchedAt: fallback.fetchedAt, freshUntil: new Date(fallback.fetchedAt.getTime() + options.ttlMs) };
    }
  }
  if (entry && value !== null && entry.freshUntil.getTime() > Date.now()) return stamp(value, entry);

  const refresh = () => {
    const existing = running.get(id);
    if (existing) return existing as Promise<T>;
    const task = (async () => {
      const owner = randomUUID();
      const requestLock = `request:${id}`;
      if (!await acquire(locks, requestLock, owner)) {
        if (entry && value !== null) return stamp(value, entry);
        for (let attempt = 0; attempt < 30; attempt++) {
          await pause(1000);
          const updated = await cache.findOne({ _id: id });
          const ready = await read<T>(updated);
          if (updated && ready !== null) return stamp(ready, updated);
          const lease = await locks.findOne({ _id: requestLock });
          if (!lease || lease.until.getTime() <= Date.now()) break;
        }
        throw new Error('This court request is already being prepared. Please retry shortly.');
      }
      const sourceLock = `source:${options.source}`;
      let sourceAcquired = false;
      let cooldown = 2000;
      let succeeded = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      try {
        sourceAcquired = await acquire(locks, sourceLock, owner);
        for (let attempt = 0; !sourceAcquired && value === null && attempt < 10; attempt++) {
          const sourceLease = await locks.findOne({ _id: sourceLock });
          if (sourceLease?.owner === 'cooldown' && sourceLease.until.getTime() - Date.now() > 5000) break;
          await pause(2000);
          sourceAcquired = await acquire(locks, sourceLock, owner);
        }
        if (!sourceAcquired) {
          if (entry && value !== null) return stamp(value, entry);
          throw new Error('The court source is busy or cooling down. Please retry shortly.');
        }
        heartbeat = setInterval(() => {
          void locks.updateMany({ owner, _id: { $in: [requestLock, sourceLock] } }, { $set: { until: new Date(Date.now() + leaseMs) } }).catch(() => undefined);
        }, 30000);
        const result = await options.load();
        const bytes = Buffer.from(JSON.stringify(result));
        const fetchedAt = new Date();
        const saved: Entry = { _id: id, fetchedAt, freshUntil: new Date(fetchedAt.getTime() + options.ttlMs) };
        try {
          if (bytes.length > 1000000) {
            saved.r2Key = (await uploadMediaToR2({ bytes, filename: `${id}.json`, contentType: 'application/json', folder: 'court-cache' })).key;
          } else saved.value = result;
          await cache.replaceOne({ _id: id }, saved, { upsert: true });
        } catch {
          cooldown = 30000;
          console.warn('[court-cache] Source response available but cache write failed.');
        }
        succeeded = true;
        return { ...result, cachedAt: fetchedAt.toISOString(), cacheStale: false, servedFromCache: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        cooldown = /429|403|rate|limit|temporar.*block/i.test(message) ? 300000
          : /captcha|not found|required|invalid|must be|unsupported/i.test(message) ? 2000 : 30000;
        if (entry && value !== null) return stamp(value, entry);
        throw error;
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (sourceAcquired) await locks.updateOne({ _id: sourceLock, owner }, { $set: { owner: 'cooldown', until: new Date(Date.now() + cooldown) } }).catch(() => undefined);
        await locks.updateOne({ _id: requestLock, owner }, { $set: { until: new Date(Date.now() + (succeeded ? 0 : 30000)) } }).catch(() => undefined);
      }
    })().finally(() => { running.delete(id); });
    running.set(id, task);
    return task;
  };
  if (entry && value !== null) {
    void refresh().catch(() => undefined);
    return stamp(value, entry);
  }
  return refresh();
}
