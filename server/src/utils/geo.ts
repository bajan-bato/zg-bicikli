/**
 * Brze geometrijske funkcije za "vruće" petlje (izgradnja grafa, prostorno preklapanje).
 *
 * Koristi se lokalna ekvidistantna projekcija oko Zagreba: na području od ~30 km
 * pogreška udaljenosti je ispod 0,1 %, a izračun je red veličine brži od
 * haversine/Turf poziva po točki. Turf se koristi za validaciju i ukupne duljine.
 */

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;
export const REF_LAT = 45.81;
const M_PER_DEG_LAT = EARTH_RADIUS_M * DEG;
const M_PER_DEG_LON = EARTH_RADIUS_M * DEG * Math.cos(REF_LAT * DEG);

export const toX = (lon: number): number => lon * M_PER_DEG_LON;
export const toY = (lat: number): number => lat * M_PER_DEG_LAT;
export const toLon = (x: number): number => x / M_PER_DEG_LON;
export const toLat = (y: number): number => y / M_PER_DEG_LAT;

export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface SegmentProjection {
  distance: number;
  /** Parametar 0–1 duž segmenta. */
  t: number;
  x: number;
  y: number;
}

export function projectOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): SegmentProjection {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { distance: Math.hypot(px - x, py - y), t, x, y };
}

/** Smjer (azimut) u stupnjevima 0–360 u planarnim koordinatama (0 = sjever). */
export function planarBearing(ax: number, ay: number, bx: number, by: number): number {
  const deg = Math.atan2(bx - ax, by - ay) / DEG;
  return (deg + 360) % 360;
}

/** Razlika dvaju smjerova bez obzira na orijentaciju linije (0–90°). */
export function axisDifference(b1: number, b2: number): number {
  let d = Math.abs(b1 - b2) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

/** Predznačeni kut skretanja od b1 prema b2 u rasponu (-180, 180]; pozitivno = desno. */
export function turnAngle(b1: number, b2: number): number {
  let d = (b2 - b1) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Duljina polilinije zadane ravnim nizom [lon, lat, lon, lat, ...] u metrima. */
export function flatLineLength(coords: ArrayLike<number>): number {
  let total = 0;
  for (let i = 2; i < coords.length; i += 2) {
    total += Math.hypot(toX(coords[i]) - toX(coords[i - 2]), toY(coords[i + 1]) - toY(coords[i - 1]));
  }
  return total;
}
