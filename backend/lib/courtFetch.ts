import { randomUUID } from 'node:crypto';
import { getDb } from './mongodb';

type Lease = { _id: string; owner: string; until: Date };

export async function courtFetch(url: string, init?: RequestInit): Promise<Response> {
  const host = new URL(url).hostname;
  if (host !== 'allahabadhighcourt.in' && !host.endsWith('.allahabadhighcourt.in')) {
    return fetch(url, init);
  }
  const locks = (await getDb()).collection<Lease>('court_request_leases');
  const id = `transport:${host}`;
  const owner = randomUUID();
  const deadline = Date.now() + 20000;
  for (;;) {
    init?.signal?.throwIfAborted();
    try {
      const acquired = await locks.findOneAndUpdate(
        { _id: id, until: { $lte: new Date() } },
        { $set: { owner, until: new Date(Date.now() + 120000) } },
        { upsert: true, returnDocument: 'after' },
      );
      if (acquired) break;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const lease = await locks.findOne({ _id: id });
    if (Date.now() >= deadline || (lease?.owner === 'cooldown' && lease.until.getTime() > deadline)) {
      throw new Error('Court request limit reached. Please retry after the cooldown.');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  let cooldown = 2000;
  try {
    const response = await fetch(url, { ...init, signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000) });
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      const retry = response.headers.get('retry-after') || '';
      const delay = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      cooldown = Math.max(response.status === 403 || response.status === 429 ? 15 * 60000 : 60000,
        Number.isFinite(delay) ? Math.min(delay, 24 * 3600000) : 0);
    }
    return response;
  } catch (error) {
    cooldown = 60000;
    throw error;
  } finally {
    await locks.updateOne({ _id: id, owner }, {
      $set: { owner: 'cooldown', until: new Date(Date.now() + cooldown) },
    });
  }
}
