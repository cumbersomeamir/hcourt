import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './mongodb';

export async function readRequestJson(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request body required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Request too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

let index: Promise<unknown> | undefined;
export async function rateLimit(scope: string, limit: number, windowMs = 60000, owner = 'global'): Promise<Response | null> {
  try {
    const collection = (await getDb()).collection<{ _id: string; count: number; expiresAt: Date }>('security_rate_limits');
    index ||= collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => { index = undefined; throw error; });
    await index;
    const window = Math.floor(Date.now() / windowMs);
    const _id = createHash('sha256').update(`${scope}:${owner}:${window}`).digest('hex');
    const result = await collection.findOneAndUpdate({ _id }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 2) * windowMs) },
    }, { upsert: true, returnDocument: 'after' });
    if (result && result.count <= limit) return null;
    return Response.json({ success: false, error: 'Too many requests. Please retry shortly.' }, {
      status: 429, headers: { 'Retry-After': String(Math.ceil(((window + 1) * windowMs - Date.now()) / 1000)), 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ success: false, error: 'Service temporarily unavailable.' }, { status: 503 });
  }
}

export async function acquirePdfSlot(): Promise<(() => Promise<void>) | null> {
  const locks = (await getDb()).collection<{ _id: string; owner: string; until: Date }>('court_request_leases');
  const owner = randomUUID();
  for (let slot = 0; slot < 2; slot++) {
    const _id = `security:pdf:${slot}`;
    try {
      const lock = await locks.findOneAndUpdate({ _id, until: { $lte: new Date() } }, {
        $set: { owner, until: new Date(Date.now() + 180000) },
      }, { upsert: true, returnDocument: 'after' });
      if (lock) {
        const heartbeat = setInterval(() => {
          void locks.updateOne({ _id, owner }, { $set: { until: new Date(Date.now() + 180000) } }).catch(() => undefined);
        }, 30000);
        return async () => { clearInterval(heartbeat); await locks.updateOne({ _id, owner }, { $set: { until: new Date(0) } }); };
      }
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  }
  return null;
}
