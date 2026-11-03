import type {
  ApiErrorBody,
  CyclewayCollection,
  GeocodeResult,
  HealthStatus,
  LatLon,
  ParkingCollection,
  PublicConfig,
  RouteMode,
  RouteResult,
} from '../types';

/** Greška REST API-ja s porukom spremnom za prikaz korisniku. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Poslužitelj aplikacije nije dostupan. Provjerite internetsku vezu.');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* odgovor nije JSON */
  }
  if (!res.ok && res.status !== 207) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Greška poslužitelja (HTTP ${res.status}).`);
  }
  return body as T;
}

export const api = {
  config: () => request<PublicConfig>('/config'),
  health: () => request<HealthStatus>('/health'),
  cycleways: () => request<CyclewayCollection>('/infrastructure/cycleways'),
  parking: () => request<ParkingCollection>('/infrastructure/parking'),
  refreshInfrastructure: () => request<unknown>('/infrastructure/refresh', { method: 'POST' }),
  geocode: (q: string, signal?: AbortSignal) =>
    request<GeocodeResult[]>(`/geocoding/search?q=${encodeURIComponent(q)}`, { signal }),
  reverse: (p: LatLon) => request<GeocodeResult | null>(`/geocoding/reverse?lat=${p.lat}&lon=${p.lon}`),
  route: (start: LatLon, end: LatLon, mode: RouteMode, signal?: AbortSignal) =>
    request<RouteResult>('/routes', {
      method: 'POST',
      body: JSON.stringify({ start: pick(start), end: pick(end), mode }),
      signal,
    }),
  recalculate: (current: LatLon, end: LatLon, mode: RouteMode) =>
    request<RouteResult>('/routes/recalculate', {
      method: 'POST',
      body: JSON.stringify({ current: pick(current), end: pick(end), mode }),
    }),
};

const pick = (p: LatLon): LatLon => ({ lat: p.lat, lon: p.lon });
