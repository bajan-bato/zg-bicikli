import type { LngLat, RouteMode, RouteResult } from '../../../../shared/types/index.js';
import { toX, toY } from '../../utils/geo.js';
import type { PathPiece } from './astar.js';
import { lineCoverage, type CyclewayIndex } from './cyclewayIndex.js';
import { sliceEdge, type RoutingGraph } from './graph.js';
import { buildInstructions, type Leg } from './instructions.js';

const segLen = (a: LngLat, b: LngLat): number => Math.hypot(toX(b[0]) - toX(a[0]), toY(b[1]) - toY(a[1]));

/** Dio polilinije između dvije udaljenosti duž nje. */
export function sliceLine(coords: LngLat[], from: number, to: number): LngLat[] {
  const out: LngLat[] = [];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = segLen(a, b);
    const s = acc;
    const e = acc + len;
    acc = e;
    if (e < from || s > to || len === 0) continue;
    const t0 = Math.max(0, (from - s) / len);
    const t1 = Math.min(1, (to - s) / len);
    const p0: LngLat = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
    const p1: LngLat = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
    if (out.length === 0) out.push(p0);
    out.push(p1);
  }
  return out;
}

const overlap = (a0: number, a1: number, intervals: Array<[number, number]>): number =>
  intervals.reduce((sum, [b0, b1]) => sum + Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)), 0);

export interface BuiltRoute
  extends Omit<RouteResult, 'id' | 'mode' | 'penaltyUsed' | 'shortestDistanceM' | 'computeMs' | 'snappedStart' | 'snappedEnd'> {}

/**
 * Sastavlja geometriju, statistiku i upute iz niza dijelova bridova.
 * Duljina biciklističkih staza računa se iz stvarnog prostornog preklapanja
 * CIJELE geometrije rute s GeoJSON stazama (ne iz atributa "duljina").
 */
export function buildRoute(
  graph: RoutingGraph,
  index: CyclewayIndex | null,
  pieces: PathPiece[],
  averageSpeedKmh: number,
): BuiltRoute {
  const coords: LngLat[] = [];
  const legsRaw: Array<{ coords: LngLat[]; edge: number }> = [];
  for (const piece of pieces) {
    const part = sliceEdge(graph.edges[piece.edge], piece.fromAlong, piece.toAlong) as LngLat[];
    legsRaw.push({ coords: part, edge: piece.edge });
    for (const p of part) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) coords.push(p);
    }
  }
  if (coords.length === 1) coords.push(coords[0]);

  const flat = coords.flat();
  const coverage = lineCoverage(index, flat);
  const distanceM = coverage.totalM;

  let along = 0;
  const legs: Leg[] = legsRaw.map(({ coords: c, edge }) => {
    let len = 0;
    for (let i = 1; i < c.length; i++) len += segLen(c[i - 1], c[i]);
    const e = graph.edges[edge];
    const leg: Leg = {
      coords: c,
      lengthM: len,
      startAlong: along,
      name: e.name,
      highway: e.highway,
      roundabout: e.roundabout,
      cyclewayShare: len > 0 ? overlap(along, along + len, coverage.intervals) / len : 0,
    };
    along += len;
    return leg;
  });

  const total = distanceM;
  const cyclewayDistanceM = Math.min(coverage.coveredM, total);

  return {
    geometry: { type: 'LineString', coordinates: coords },
    distanceM: round1(total),
    durationS: Math.round(total / (averageSpeedKmh / 3.6)),
    cyclewayDistanceM: round1(cyclewayDistanceM),
    cyclewayShare: total > 0 ? Math.round((cyclewayDistanceM / total) * 1000) / 1000 : 0,
    roadDistanceM: round1(total - cyclewayDistanceM),
    ...displaySegments(coords, coverage.intervals, total),
    instructions: buildInstructions(legs, coords[coords.length - 1], round1(total)),
    averageSpeedKmh,
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Ispod ove duljine (m) dio rute se ne prikazuje zasebno – izbjegava "mrvice" na karti. */
const MIN_DISPLAY_M = 5;

/**
 * Dijeli rutu na dijelove po stazi i bez staze tako da zajedno pokrivaju cijelu
 * rutu. Vrlo kratki dijelovi pripajaju se susjedima samo za prikaz; statistika
 * se i dalje računa iz točnih intervala.
 */
export function displaySegments(
  coords: LngLat[],
  intervals: Array<[number, number]>,
  total: number,
): { cyclewaySegments: LngLat[][]; roadSegments: LngLat[][] } {
  const merged: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    if (b - a < MIN_DISPLAY_M) continue;
    const last = merged[merged.length - 1];
    if (last && a - last[1] < MIN_DISPLAY_M) last[1] = b;
    else merged.push([a, b]);
  }
  const roads: Array<[number, number]> = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a - cursor > 0) roads.push([cursor, a]);
    cursor = b;
  }
  if (total - cursor > 0) roads.push([cursor, total]);
  // Kratki početni/završni dio uz stazu pripada stazi, ne zasebnom komadu ceste.
  const visibleRoads = roads.filter(([a, b]) => b - a >= MIN_DISPLAY_M || merged.length === 0);
  return {
    cyclewaySegments: merged.map(([a, b]) => sliceLine(coords, a, b)),
    roadSegments: visibleRoads.map(([a, b]) => sliceLine(coords, a, b)),
  };
}
