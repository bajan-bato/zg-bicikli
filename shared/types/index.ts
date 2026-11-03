/**
 * Tipovi koje dijele frontend i backend (REST API ugovor).
 */

export type LngLat = [number, number];

export type RouteMode = 'shortest' | 'cycleways';

export interface LatLon {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Infrastruktura (CKAN)
// ---------------------------------------------------------------------------

export interface CyclewayProperties {
  OBJECTID: number;
  kategorija_id: string | null;
  lokacija: string | null;
  zavrsni_sloj: string | null;
  duljina: number | null;
  MJESNI_ODBOR: string | null;
  GRADSKA_CETVRT: string | null;
  SHAPE_Length: number | null;
  /** Duljina izračunata iz stvarne geometrije (metri). */
  geomLengthM: number;
}

export interface ParkingProperties {
  OBJECTID: number;
  vrsta: string | null;
  naziv: string | null;
  lokacija: string | null;
  broj_stalaka: number | null;
  broj_bicikala: number | null;
  godina_postavljanja: number | null;
  MJESNI_ODBOR: string | null;
  GRADSKA_CETVRT: string | null;
}

export interface Feature<G, P> {
  type: 'Feature';
  id?: number | string;
  geometry: G;
  properties: P;
}

export interface MultiLineStringGeometry {
  type: 'MultiLineString';
  coordinates: LngLat[][];
}

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: LngLat[];
}

export interface PointGeometry {
  type: 'Point';
  coordinates: LngLat;
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
}

export type CyclewayCollection = FeatureCollection<MultiLineStringGeometry, CyclewayProperties>;
export type ParkingCollection = FeatureCollection<PointGeometry, ParkingProperties>;

export interface DatasetSource {
  datasetId: string;
  datasetName: string;
  datasetTitle: string;
  organization: string | null;
  license: string | null;
  resourceId: string;
  resourceName: string;
  resourceUrl: string;
  portalUrl: string;
  fetchedAt: string;
  featureCount: number;
  skippedFeatures: number;
}

export interface DatasetStatus {
  available: boolean;
  source: DatasetSource | null;
  lastError: string | null;
  lastAttemptAt: string | null;
  stale: boolean;
}

export interface InfrastructureStatus {
  cycleways: DatasetStatus;
  parking: DatasetStatus;
}

// ---------------------------------------------------------------------------
// Geokodiranje
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  label: string;
  detail: string | null;
  lat: number;
  lon: number;
  source: 'photon' | 'nominatim';
}

// ---------------------------------------------------------------------------
// Rute
// ---------------------------------------------------------------------------

export interface RouteRequest {
  start: LatLon;
  end: LatLon;
  mode: RouteMode;
}

export interface RecalculateRequest {
  current: LatLon;
  end: LatLon;
  mode: RouteMode;
}

export type InstructionType = 'depart' | 'turn' | 'continue' | 'arrive';
export type TurnModifier =
  | 'straight'
  | 'slight-left'
  | 'slight-right'
  | 'left'
  | 'right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn';

export interface Instruction {
  type: InstructionType;
  modifier: TurnModifier | null;
  /** Tekst upute na hrvatskom. */
  text: string;
  /** Naziv ulice / puta na koji uputa vodi. */
  streetName: string | null;
  /** Je li dionica nakon upute biciklistička staza (prema podacima Grada Zagreba). */
  onCycleway: boolean;
  /** Duljina dionice nakon ove upute (m). */
  distanceM: number;
  /** Udaljenost od početka rute do točke upute (m). */
  alongM: number;
  location: LngLat;
}

export interface RouteResult {
  id: string;
  mode: RouteMode;
  geometry: LineStringGeometry;
  distanceM: number;
  durationS: number;
  cyclewayDistanceM: number;
  /** 0–1 */
  cyclewayShare: number;
  roadDistanceM: number;
  /** Dijelovi rute koji se prostorno poklapaju s biciklističkim stazama. */
  cyclewaySegments: LngLat[][];
  instructions: Instruction[];
  snappedStart: LngLat;
  snappedEnd: LngLat;
  /** Penal za obične ceste koji je stvarno korišten (0 za najkraću rutu). */
  penaltyUsed: number;
  /** Duljina najkraće rute za usporedbu (m). */
  shortestDistanceM: number;
  averageSpeedKmh: number;
  computeMs: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface HealthStatus {
  status: 'ok';
  routing: {
    state: 'idle' | 'loading' | 'ready' | 'error';
    message: string | null;
    vertices: number;
    edges: number;
    cyclewayCoveredKm: number;
    osmTimestamp: string | null;
  };
  infrastructure: InfrastructureStatus;
}

export interface PublicConfig {
  averageSpeedKmh: number;
  mapCenter: LatLon;
  bbox: [number, number, number, number];
  navigation: {
    offRouteThresholdM: number;
    offRouteConfirmations: number;
    offRouteMinDurationMs: number;
    maxAcceptableAccuracyM: number;
    arrivalRadiusM: number;
    rerouteCooldownMs: number;
  };
}
