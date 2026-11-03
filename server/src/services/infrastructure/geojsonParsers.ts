import { length as turfLength, multiLineString } from '@turf/turf';
import type {
  CyclewayCollection,
  CyclewayProperties,
  LngLat,
  ParkingCollection,
  ParkingProperties,
} from '../../../../shared/types/index.js';
import { config } from '../../config/index.js';
import { AppError, ErrorCodes } from '../../utils/errors.js';

export const CYCLEWAY_FIELDS = [
  'OBJECTID',
  'kategorija_id',
  'lokacija',
  'zavrsni_sloj',
  'duljina',
  'MJESNI_ODBOR',
  'GRADSKA_CETVRT',
  'SHAPE_Length',
] as const;

export const PARKING_FIELDS = [
  'OBJECTID',
  'vrsta',
  'naziv',
  'lokacija',
  'broj_stalaka',
  'broj_bicikala',
  'godina_postavljanja',
  'MJESNI_ODBOR',
  'GRADSKA_CETVRT',
] as const;

/** Najmanji udio objekata koji moraju imati sva očekivana svojstva. */
const MIN_SCHEMA_MATCH = 0.9;

interface RawFeature {
  type?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

const invalid = (label: string, reason: string): AppError =>
  new AppError(502, ErrorCodes.INVALID_GEOJSON, `GeoJSON nije ispravan (${label}): ${reason}`);

function readFeatures(raw: unknown, label: string): RawFeature[] {
  if (!raw || typeof raw !== 'object') throw invalid(label, 'odgovor nije JSON objekt');
  const fc = raw as { type?: unknown; features?: unknown };
  if (fc.type !== 'FeatureCollection') throw invalid(label, 'očekivan je tip FeatureCollection');
  if (!Array.isArray(fc.features)) throw invalid(label, 'nedostaje polje "features"');
  if (fc.features.length === 0) throw invalid(label, 'skup ne sadrži nijedan objekt');
  return fc.features as RawFeature[];
}

function assertSchema(features: RawFeature[], fields: readonly string[], label: string): void {
  const matching = features.filter((f) => f.properties && fields.every((k) => k in f.properties!)).length;
  if (matching / features.length < MIN_SCHEMA_MATCH) {
    const sample = Object.keys(features[0]?.properties ?? {}).join(', ');
    throw invalid(label, `nema očekivanu strukturu svojstava (${fields.join(', ')}); pronađeno: ${sample}`);
  }
}

const isLngLat = (c: unknown): c is LngLat =>
  Array.isArray(c) &&
  c.length >= 2 &&
  typeof c[0] === 'number' &&
  typeof c[1] === 'number' &&
  Number.isFinite(c[0]) &&
  Number.isFinite(c[1]) &&
  Math.abs(c[0]) <= 180 &&
  Math.abs(c[1]) <= 90;

/** Proširen obuhvat – podaci moraju biti u WGS84 i u okolici Zagreba. */
const inArea = ([lon, lat]: LngLat): boolean => {
  const [w, s, e, n] = config.area.bbox;
  return lon >= w - 0.2 && lon <= e + 0.2 && lat >= s - 0.2 && lat <= n + 0.2;
};

/** Uklanja suvišne navodnike ("Eugen Kvaternik") i praznine. */
export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/^"+|"+$/g, '').trim();
  return text === '' ? null : text;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseCycleways(raw: unknown): { data: CyclewayCollection; skipped: number; featureCount: number } {
  const label = 'biciklističke staze';
  const features = readFeatures(raw, label);
  assertSchema(features, CYCLEWAY_FIELDS, label);

  const out: CyclewayCollection = { type: 'FeatureCollection', features: [] };
  let skipped = 0;
  let outside = 0;

  for (const f of features) {
    const g = f.geometry;
    let lines: LngLat[][] | null = null;
    if (g?.type === 'MultiLineString' && Array.isArray(g.coordinates)) lines = g.coordinates as LngLat[][];
    else if (g?.type === 'LineString' && Array.isArray(g.coordinates)) lines = [g.coordinates as LngLat[]];

    const valid = (lines ?? [])
      .map((line) => (Array.isArray(line) ? line.filter(isLngLat).map((c) => [c[0], c[1]] as LngLat) : []))
      .filter((line) => line.length >= 2);
    if (valid.length === 0) {
      skipped++;
      continue;
    }
    if (!inArea(valid[0][0])) outside++;

    const p = f.properties ?? {};
    const properties: CyclewayProperties = {
      OBJECTID: toNumber(p.OBJECTID) ?? out.features.length + 1,
      kategorija_id: cleanText(p.kategorija_id),
      lokacija: cleanText(p.lokacija),
      zavrsni_sloj: cleanText(p.zavrsni_sloj),
      duljina: toNumber(p.duljina),
      MJESNI_ODBOR: cleanText(p.MJESNI_ODBOR),
      GRADSKA_CETVRT: cleanText(p.GRADSKA_CETVRT),
      SHAPE_Length: toNumber(p.SHAPE_Length),
      geomLengthM: Math.round(turfLength(multiLineString(valid), { units: 'meters' }) * 10) / 10,
    };
    out.features.push({ type: 'Feature', id: properties.OBJECTID, geometry: { type: 'MultiLineString', coordinates: valid }, properties });
  }

  if (out.features.length === 0) throw invalid(label, 'nijedan objekt nema ispravnu linijsku geometriju');
  if (outside / out.features.length > 0.5) {
    throw invalid(label, 'koordinate nisu u WGS84 (lon, lat) ili nisu na području Zagreba');
  }
  return { data: out, skipped, featureCount: out.features.length };
}

export function parseParking(raw: unknown): { data: ParkingCollection; skipped: number; featureCount: number } {
  const label = 'parkirališta za bicikle';
  const features = readFeatures(raw, label);
  assertSchema(features, PARKING_FIELDS, label);

  const out: ParkingCollection = { type: 'FeatureCollection', features: [] };
  let skipped = 0;
  let outside = 0;

  for (const f of features) {
    const g = f.geometry;
    if (g?.type !== 'Point' || !isLngLat(g.coordinates)) {
      skipped++;
      continue;
    }
    const coords: LngLat = [g.coordinates[0], g.coordinates[1]];
    if (!inArea(coords)) outside++;
    const p = f.properties ?? {};
    const properties: ParkingProperties = {
      OBJECTID: toNumber(p.OBJECTID) ?? out.features.length + 1,
      vrsta: cleanText(p.vrsta),
      naziv: cleanText(p.naziv),
      lokacija: cleanText(p.lokacija),
      broj_stalaka: toNumber(p.broj_stalaka),
      broj_bicikala: toNumber(p.broj_bicikala),
      godina_postavljanja: toNumber(p.godina_postavljanja),
      MJESNI_ODBOR: cleanText(p.MJESNI_ODBOR),
      GRADSKA_CETVRT: cleanText(p.GRADSKA_CETVRT),
    };
    out.features.push({ type: 'Feature', id: properties.OBJECTID, geometry: { type: 'Point', coordinates: coords }, properties });
  }

  if (out.features.length === 0) throw invalid(label, 'nijedan objekt nema ispravnu točkastu geometriju');
  if (outside / out.features.length > 0.5) {
    throw invalid(label, 'koordinate nisu u WGS84 (lon, lat) ili nisu na području Zagreba');
  }
  return { data: out, skipped, featureCount: out.features.length };
}
