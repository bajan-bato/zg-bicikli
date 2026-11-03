import { lineString, point } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import type { LngLat } from '../types';

export interface RouteProgress {
  /** Udaljenost korisnika od rute (m). */
  distanceFromRouteM: number;
  /** Prijeđeni dio rute mjeren duž rute (m). */
  alongM: number;
  snapped: LngLat;
}

/** Projekcija GPS položaja na geometriju rute (Turf.js). */
export function routeProgress(coords: LngLat[], lon: number, lat: number): RouteProgress {
  if (coords.length < 2) return { distanceFromRouteM: Infinity, alongM: 0, snapped: coords[0] ?? [lon, lat] };
  const nearest = nearestPointOnLine(lineString(coords), point([lon, lat]), { units: 'meters' });
  const p = nearest.properties as Record<string, number>;
  return {
    distanceFromRouteM: p.dist ?? p.pointDistance ?? Infinity,
    alongM: p.location ?? p.totalDistance ?? 0,
    snapped: nearest.geometry.coordinates as LngLat,
  };
}

export function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6_371_008.8;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
