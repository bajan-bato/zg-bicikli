import { config } from '../../config/index.js';
import { AppError, ErrorCodes, errorMessage } from '../../utils/errors.js';
import { FileCache } from '../../utils/fileCache.js';
import { fetchWithTimeout } from '../../utils/http.js';

/**
 * Cestovna mreža Zagreba iz OpenStreetMapa (Overpass API).
 * Preuzima se jednom i sprema na disk; osvježava se nakon config.osm.maxAgeMs.
 */

export interface OsmWay {
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}

export interface OsmNetwork {
  fetchedAt: string;
  osmTimestamp: string | null;
  bbox: [number, number, number, number];
  /** Parovi [osmId, lon, lat] spljošteni u jedan niz radi manje predmemorije. */
  nodes: number[];
  ways: OsmWay[];
}

const KEPT_TAGS = new Set([
  'highway',
  'name',
  'ref',
  'oneway',
  'oneway:bicycle',
  'bicycle',
  'access',
  'vehicle',
  'cycleway',
  'cycleway:left',
  'cycleway:right',
  'cycleway:both',
  'junction',
  'footway',
  'surface',
]);

/** Vrste prometnica koje uopće dolaze u obzir (autoceste i neizgrađeno se izbacuju već u upitu). */
export function buildOverpassQuery(bbox: [number, number, number, number]): string {
  const [w, s, e, n] = bbox;
  const excluded =
    'motorway|motorway_link|construction|proposed|planned|raceway|bus_guideway|escape|platform|abandoned|elevator|corridor|bridleway|steps';
  return `[out:json][timeout:${Math.round(config.osm.timeoutMs / 1000)}];
way["highway"]["highway"!~"^(${excluded})$"]["area"!="yes"](${s},${w},${n},${e});
(._;>;);
out body qt;`;
}

interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements: Array<
    | { type: 'node'; id: number; lat: number; lon: number }
    | { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string> }
  >;
}

export function compactOverpass(body: OverpassResponse, bbox: [number, number, number, number]): OsmNetwork {
  const nodes: number[] = [];
  const ways: OsmWay[] = [];
  for (const el of body.elements ?? []) {
    if (el.type === 'node') nodes.push(el.id, el.lon, el.lat);
    else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
      const tags: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.tags ?? {})) if (KEPT_TAGS.has(k)) tags[k] = v;
      ways.push({ id: el.id, nodes: el.nodes, tags });
    }
  }
  return {
    fetchedAt: new Date().toISOString(),
    osmTimestamp: body.osm3s?.timestamp_osm_base ?? null,
    bbox,
    nodes,
    ways,
  };
}

export class OsmNetworkProvider {
  constructor(
    private readonly cache = new FileCache(config.dataDir),
    private readonly urls = config.osm.overpassUrls,
  ) {}

  async load(onProgress?: (msg: string) => void): Promise<OsmNetwork> {
    const cached = await this.cache.read<OsmNetwork>('osm-network');
    const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < config.osm.maxAgeMs;
    if (cached && fresh) return cached;

    try {
      onProgress?.('Preuzimanje cestovne mreže iz OpenStreetMapa (Overpass API)…');
      const network = await this.download();
      await this.cache.write('osm-network', network);
      return network;
    } catch (err) {
      if (cached) {
        console.warn(`[osm] Osvježavanje mreže nije uspjelo, koristi se predmemorija: ${errorMessage(err)}`);
        return cached;
      }
      throw err;
    }
  }

  private async download(): Promise<OsmNetwork> {
    const query = buildOverpassQuery(config.area.bbox);
    const errors: string[] = [];
    for (const url of this.urls) {
      try {
        const started = Date.now();
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          timeoutMs: config.osm.timeoutMs,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        });
        const body = (await res.json()) as OverpassResponse;
        const network = compactOverpass(body, config.area.bbox);
        if (network.ways.length < 1000) throw new Error(`premalo prometnica (${network.ways.length})`);
        console.log(
          `[osm] Preuzeto ${network.ways.length} putova i ${network.nodes.length / 3} čvorova s ${new URL(url).host} za ${Math.round((Date.now() - started) / 1000)} s`,
        );
        return network;
      } catch (err) {
        errors.push(`${new URL(url).host}: ${errorMessage(err)}`);
      }
    }
    throw new AppError(503, ErrorCodes.OSM_UNAVAILABLE, `Cestovnu mrežu nije moguće preuzeti: ${errors.join(' | ')}`);
  }
}
