import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Centralizirana konfiguracija: svi vanjski servisi, URL-ovi i parametri algoritma.
 * Svaka vrijednost može se nadjačati varijablom okruženja.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Varijabla okruženja ${name} mora biti broj (dobiveno "${raw}")`);
  return value;
};

const list = (name: string, fallback: string[]): string[] => {
  const raw = process.env[name];
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
};

/** Obuhvat Grada Zagreba: [zapad, jug, istok, sjever] (WGS84). */
const bbox: [number, number, number, number] = [15.82, 45.7, 16.25, 45.93];

export const config = {
  port: num('PORT', 3001),
  isProduction: process.env.NODE_ENV === 'production',
  dataDir: process.env.DATA_DIR ?? path.resolve(here, '../../data/cache'),
  clientDistDir: path.resolve(here, '../../../client/dist'),
  userAgent: process.env.USER_AGENT ?? 'ZagrebBikeNavigator/1.0 (open-source edukacijski projekt)',

  area: {
    bbox,
    center: { lat: 45.8131, lon: 15.9775 },
  },

  ckan: {
    baseUrl: process.env.CKAN_BASE_URL ?? 'https://data.gov.hr/ckan/api/3/action',
    portalUrl: process.env.CKAN_PORTAL_URL ?? 'https://data.gov.hr/ckan/dataset',
    timeoutMs: num('CKAN_TIMEOUT_MS', 30_000),
    downloadTimeoutMs: num('CKAN_DOWNLOAD_TIMEOUT_MS', 90_000),
    /** Koliko dugo se predmemorirani podaci smatraju svježima. */
    maxAgeMs: num('CKAN_MAX_AGE_HOURS', 24) * 3600_000,
  },

  osm: {
    overpassUrls: list('OVERPASS_URLS', [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]),
    timeoutMs: num('OVERPASS_TIMEOUT_MS', 300_000),
    maxAgeMs: num('OSM_MAX_AGE_DAYS', 30) * 24 * 3600_000,
  },

  geocoding: {
    photonUrl: process.env.PHOTON_URL ?? 'https://photon.komoot.io',
    nominatimUrl: process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
    timeoutMs: num('GEOCODING_TIMEOUT_MS', 8_000),
    limit: 6,
  },

  routing: {
    /** Prosječna brzina bicikliranja za procjenu trajanja (km/h). */
    averageSpeedKmh: num('AVERAGE_SPEED_KMH', 15),
    /** Najveća udaljenost (m) između točke rute i staze da bi se smatrala preklapanjem. */
    cyclewayMatchToleranceM: num('CYCLEWAY_MATCH_TOLERANCE_M', 15),
    /** Najveća razlika smjera (°) između segmenta ceste i staze. */
    cyclewayBearingToleranceDeg: num('CYCLEWAY_BEARING_TOLERANCE_DEG', 30),
    /** Razmak uzorkovanja pri prostornom preklapanju (m). */
    sampleSpacingM: num('CYCLEWAY_SAMPLE_SPACING_M', 5),
    /** cost = duljina_ceste * (1 + penal) – penal za dionice bez biciklističke staze. */
    roadPenalty: num('ROAD_PENALTY', 1.5),
    /** Najveći dopušteni omjer duljine rute sa stazama i najkraće rute. */
    maxDetourFactor: num('MAX_DETOUR_FACTOR', 1.4),
    /** Udio pokrivenosti stazom potreban da pješačka staza postane prohodna za bicikl. */
    footwayCoverageThreshold: num('FOOTWAY_COVERAGE_THRESHOLD', 0.6),
    /** Najveća udaljenost (m) od polazišta/odredišta do mreže. */
    snapMaxDistanceM: num('SNAP_MAX_DISTANCE_M', 400),
    /** Komponente mreže manje od ovoga ne koriste se za "lijepljenje" točaka. */
    minComponentSize: num('MIN_COMPONENT_SIZE', 200),
    routeCacheSize: num('ROUTE_CACHE_SIZE', 300),
  },

  navigation: {
    offRouteThresholdM: num('NAV_OFF_ROUTE_THRESHOLD_M', 35),
    offRouteConfirmations: num('NAV_OFF_ROUTE_CONFIRMATIONS', 3),
    offRouteMinDurationMs: num('NAV_OFF_ROUTE_MIN_DURATION_MS', 4_000),
    maxAcceptableAccuracyM: num('NAV_MAX_ACCURACY_M', 50),
    arrivalRadiusM: num('NAV_ARRIVAL_RADIUS_M', 25),
    rerouteCooldownMs: num('NAV_REROUTE_COOLDOWN_MS', 10_000),
  },
};

export type AppConfig = typeof config;
export type RoutingConfig = AppConfig['routing'];
