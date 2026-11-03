import type { GeocodeResult } from '../../../../shared/types/index.js';
import { config } from '../../config/index.js';
import { AppError, ErrorCodes, errorMessage } from '../../utils/errors.js';
import { fetchJson } from '../../utils/http.js';
import { LruCache } from '../../utils/lru.js';
import type { FetchJson } from '../ckan/ckanClient.js';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    locality?: string;
    postcode?: string;
    osm_value?: string;
  };
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
}

/**
 * Geokodiranje: Photon (komoot, OSM podaci) kao primarni servis, Nominatim kao
 * rezervni. Rezultati se ograničavaju na područje Zagreba i predmemoriraju.
 */
export class GeocodingService {
  private readonly cache = new LruCache<string, GeocodeResult[]>(500);

  constructor(private readonly http: FetchJson = fetchJson) {}

  async search(query: string): Promise<GeocodeResult[]> {
    const q = query.trim();
    const coords = parseCoordinates(q);
    if (coords) return [{ label: `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}`, detail: 'Koordinate', ...coords, source: 'photon' }];

    const key = `s:${q.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const errors: string[] = [];
    for (const provider of [() => this.photon(q), () => this.nominatim(q)]) {
      try {
        const results = await provider();
        this.cache.set(key, results);
        return results;
      } catch (err) {
        errors.push(errorMessage(err));
      }
    }
    throw new AppError(502, ErrorCodes.GEOCODING_UNAVAILABLE, `Servis za geokodiranje trenutno nije dostupan. ${errors.join(' | ')}`);
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResult | null> {
    const key = `r:${lat.toFixed(5)},${lon.toFixed(5)}`;
    const cached = this.cache.get(key);
    if (cached) return cached[0] ?? null;
    try {
      const url = `${config.geocoding.photonUrl}/reverse?lat=${lat}&lon=${lon}&limit=1`;
      const body = await this.http<{ features: PhotonFeature[] }>(url, { timeoutMs: config.geocoding.timeoutMs });
      const results = (body.features ?? []).map(fromPhoton);
      this.cache.set(key, results);
      return results[0] ?? null;
    } catch {
      return null; // obrnuto geokodiranje je samo kozmetika – koordinate su dovoljne
    }
  }

  private async photon(q: string): Promise<GeocodeResult[]> {
    const [w, s, e, n] = config.area.bbox;
    const { lat, lon } = config.area.center;
    const params = new URLSearchParams({
      q,
      limit: String(config.geocoding.limit),
      lat: String(lat),
      lon: String(lon),
      bbox: `${w},${s},${e},${n}`,
    });
    const body = await this.http<{ features: PhotonFeature[] }>(`${config.geocoding.photonUrl}/api/?${params}`, {
      timeoutMs: config.geocoding.timeoutMs,
    });
    return dedupe((body.features ?? []).map(fromPhoton).filter(inArea));
  }

  private async nominatim(q: string): Promise<GeocodeResult[]> {
    const [w, s, e, n] = config.area.bbox;
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: String(config.geocoding.limit),
      viewbox: `${w},${n},${e},${s}`,
      bounded: '1',
      countrycodes: 'hr',
      'accept-language': 'hr',
    });
    const body = await this.http<NominatimItem[]>(`${config.geocoding.nominatimUrl}/search?${params}`, {
      timeoutMs: config.geocoding.timeoutMs,
    });
    return dedupe(
      (body ?? []).map((item) => {
        const [first, ...rest] = item.display_name.split(', ');
        return {
          label: item.name || first,
          detail: rest.slice(0, 3).join(', ') || null,
          lat: Number(item.lat),
          lon: Number(item.lon),
          source: 'nominatim' as const,
        };
      }),
    );
  }
}

function fromPhoton(f: PhotonFeature): GeocodeResult {
  const p = f.properties;
  const street = p.street ? `${p.street}${p.housenumber ? ` ${p.housenumber}` : ''}` : null;
  const label = p.name ?? street ?? p.district ?? p.city ?? 'Lokacija';
  const detailParts = [p.name && street ? street : null, p.district ?? p.locality, p.postcode, p.city].filter(Boolean);
  return {
    label,
    detail: detailParts.length ? detailParts.join(', ') : null,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    source: 'photon',
  };
}

const inArea = (r: GeocodeResult): boolean => {
  const [w, s, e, n] = config.area.bbox;
  return r.lon >= w && r.lon <= e && r.lat >= s && r.lat <= n;
};

const dedupe = (items: GeocodeResult[]): GeocodeResult[] => {
  const seen = new Set<string>();
  return items.filter((r) => {
    const k = `${r.label}|${r.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Prepoznaje unos "45.81, 15.97". */
export function parseCoordinates(q: string): { lat: number; lon: number } | null {
  const m = q.match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lon = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
