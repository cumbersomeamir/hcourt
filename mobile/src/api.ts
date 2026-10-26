import { appWebUrl } from './config';

export type Api = <T>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
) => Promise<T>;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function createApi(token: string, onExpired: () => void): Api {
  return async <T>(
    path: string,
    body?: unknown,
    method = 'POST',
    signal?: AbortSignal,
  ): Promise<T> => {
    const target = new URL(path, appWebUrl.origin);
    if (
      target.origin !== appWebUrl.origin ||
      !target.pathname.startsWith('/api/')
    ) {
      throw new Error('Invalid API address.');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 120000);
    try {
      const response = await fetch(target.toString(), {
        method: body === undefined ? 'GET' : method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 401) onExpired();
      const data = await response.json();
      if (data.code === 'captcha_required' && data.captchaChallenge)
        return data as T;
      if (
        !response.ok ||
        data.success === false ||
        data.code === 'document_preparing'
      ) {
        throw new ApiError(
          data.error || 'Unable to load court data. Please retry.',
          response.status,
        );
      }
      return data as T;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}
