import { appWebUrl } from './config';

const allowedOrigin = appWebUrl.origin;

export function isAllowedAppUrl(value: string) {
  if (value === 'about:blank') return true;

  try {
    const url = new URL(value);
    return url.origin === allowedOrigin || value.startsWith(`blob:${allowedOrigin}/`);
  } catch {
    return false;
  }
}

export function appUrlFromDeepLink(value: string) {
  try {
    const link = new URL(value);
    if (link.protocol !== 'hcourt:') return null;

    const path = `/${link.hostname}${link.pathname}`.replace(/\/{2,}/g, '/');
    const target = new URL(`${path}${link.search}${link.hash}`, appWebUrl);
    return isAllowedAppUrl(target.toString()) ? target.toString() : null;
  } catch {
    return null;
  }
}
