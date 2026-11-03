import { config } from '../config/index.js';

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

/** fetch s vremenskim ograničenjem, User-Agent zaglavljem i jasnim porukama o grešci. */
export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 30_000, headers, ...rest } = options;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
        ? `isteklo vrijeme čekanja (${Math.round(timeoutMs / 1000)} s)`
        : err instanceof Error
          ? err.message
          : String(err);
    throw new HttpError(url, null, `Zahtjev prema ${new URL(url).host} nije uspio: ${reason}`);
  }
  if (!response.ok) {
    throw new HttpError(url, response.status, `${new URL(url).host} je vratio HTTP ${response.status}`);
  }
  return response;
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(url, response.status, `${new URL(url).host} nije vratio ispravan JSON`);
  }
}
