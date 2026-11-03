import { config } from '../../config/index.js';
import { fetchJson, type FetchOptions } from '../../utils/http.js';
import { AppError, ErrorCodes, errorMessage } from '../../utils/errors.js';

/** Podskup CKAN modela koji aplikacija koristi. */
export interface CkanResource {
  id: string;
  name: string | null;
  format: string | null;
  url: string;
  mimetype?: string | null;
}

export interface CkanPackage {
  id: string;
  name: string;
  title: string;
  license_id?: string | null;
  license_title?: string | null;
  organization?: { title?: string | null; name?: string | null } | null;
  resources: CkanResource[];
}

interface CkanEnvelope<T> {
  success: boolean;
  result: T;
  error?: { message?: string };
}

export type FetchJson = <T>(url: string, options?: FetchOptions) => Promise<T>;

/** Tanki klijent za CKAN Action API (https://docs.ckan.org/en/latest/api/). */
export class CkanClient {
  constructor(
    private readonly baseUrl: string = config.ckan.baseUrl,
    private readonly http: FetchJson = fetchJson,
  ) {}

  private async action<T>(action: string, params: Record<string, string | number>): Promise<T> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const url = `${this.baseUrl}/${action}?${qs}`;
    let body: CkanEnvelope<T>;
    try {
      body = await this.http<CkanEnvelope<T>>(url, { timeoutMs: config.ckan.timeoutMs });
    } catch (err) {
      throw new AppError(
        502,
        ErrorCodes.CKAN_UNAVAILABLE,
        `Portal otvorenih podataka (CKAN API) trenutno nije dostupan: ${errorMessage(err)}`,
      );
    }
    if (!body || body.success !== true) {
      throw new AppError(
        502,
        ErrorCodes.CKAN_UNAVAILABLE,
        `CKAN API je vratio grešku: ${body?.error?.message ?? 'nepoznat odgovor'}`,
      );
    }
    return body.result;
  }

  async packageSearch(query: string, rows = 20): Promise<CkanPackage[]> {
    const result = await this.action<{ count: number; results: CkanPackage[] }>('package_search', { q: query, rows });
    return Array.isArray(result.results) ? result.results : [];
  }

  async packageShow(id: string): Promise<CkanPackage> {
    return this.action<CkanPackage>('package_show', { id });
  }

  /** Preuzima sadržaj resursa (GeoJSON). */
  async downloadJson<T>(url: string): Promise<T> {
    try {
      return await this.http<T>(url, {
        timeoutMs: config.ckan.downloadTimeoutMs,
        headers: { Accept: 'application/geo+json, application/json' },
      });
    } catch (err) {
      throw new AppError(502, ErrorCodes.CKAN_UNAVAILABLE, `Preuzimanje GeoJSON resursa nije uspjelo: ${errorMessage(err)}`);
    }
  }
}

export const isGeoJsonResource = (r: CkanResource): boolean => {
  const format = (r.format ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const mime = (r.mimetype ?? '').toLowerCase();
  return format === 'geojson' || mime.includes('geo+json') || /format=geojson/i.test(r.url ?? '');
};
