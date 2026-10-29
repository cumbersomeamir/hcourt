import { courtFetch as fetch } from './courtFetch';
export function courtDownloadUrl(value: string, hosts: string[]): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !hosts.includes(url.hostname) || !/^\/clist\/[^/]+\.(pdf|txt)$/i.test(url.pathname)) {
    throw new Error('Only official court document URLs are allowed');
  }
  url.hash = '';
  return url.toString();
}

export async function fetchCourtDownload(value: string, hosts: string[], init: RequestInit) {
  let url = courtDownloadUrl(value, hosts);
  const signal = init.signal || AbortSignal.timeout(60000);
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, { ...init, signal, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location) throw new Error('Invalid court redirect');
    url = courtDownloadUrl(new URL(location, url).toString(), hosts);
  }
  throw new Error('Too many court redirects');
}

export async function readCourtDownload(response: Response) {
  const maxBytes = 64 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty court response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Court document exceeds download limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
