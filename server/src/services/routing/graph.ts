import { projectOnSegment, toX, toY } from '../../utils/geo.js';
import { lineCoverage, type CyclewayIndex } from './cyclewayIndex.js';
import type { OsmNetwork, OsmWay } from './osmNetwork.js';

/**
 * Usmjereni težinski graf biciklističke mreže izgrađen iz OSM-a.
 * Vrhovi su raskrižja (čvorovi koje dijeli više putova) i krajevi putova;
 * bridovi nose punu geometriju dionice između dva vrha.
 */

export interface Edge {
  from: number;
  to: number;
  /** Ravni niz [lon, lat, lon, lat, ...] od `from` prema `to`. */
  coords: Float64Array;
  /** Kumulativna duljina (m) do svake točke geometrije. */
  cum: Float64Array;
  length: number;
  /** Metri brida koji se prostorno poklapaju s biciklističkim stazama Grada Zagreba. */
  covered: number;
  name: string | null;
  highway: string;
  roundabout: boolean;
  forward: boolean;
  backward: boolean;
  /** Pješačke površine: prohodne samo ako ih potvrđuju podaci o biciklističkim stazama. */
  conditional: boolean;
  usable: boolean;
  wayId: number;
}

export interface Snap {
  edge: number;
  /** Udaljenost (m) od početka brida do projicirane točke. */
  along: number;
  lon: number;
  lat: number;
  distanceM: number;
}

const BIKE_YES = new Set(['yes', 'designated', 'permissive', 'dismount']);
const ROAD_TYPES = new Set([
  'cycleway',
  'residential',
  'living_street',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'service',
  'track',
  'road',
  'path',
]);
const PEDESTRIAN_TYPES = new Set(['footway', 'pedestrian', 'trunk', 'trunk_link', 'services', 'rest_area']);

export type WayClass = 'legal' | 'conditional' | 'excluded';

/** Pravila pristupa za bicikl prema OSM oznakama (hrvatski zadani pristup). */
export function classifyWay(tags: Record<string, string>): WayClass {
  const hw = tags.highway;
  const bicycle = tags.bicycle;
  if (!hw) return 'excluded';
  if (bicycle === 'no') return 'excluded';
  const restricted = ['no', 'private'].includes(tags.access ?? '') || tags.vehicle === 'no';
  if (restricted && !BIKE_YES.has(bicycle ?? '')) return 'excluded';
  if (bicycle === 'use_sidepath') return 'conditional';
  if (BIKE_YES.has(bicycle ?? '')) return 'legal';
  if (hw === 'footway' && tags.footway === 'crossing') return 'legal';
  if (ROAD_TYPES.has(hw)) return 'legal';
  if (PEDESTRIAN_TYPES.has(hw)) return 'conditional';
  return 'excluded';
}

export function wayDirections(tags: Record<string, string>): { forward: boolean; backward: boolean } {
  const oneway = tags.oneway;
  const roundabout = tags.junction === 'roundabout' || tags.junction === 'circular';
  const contraflow = tags['oneway:bicycle'] === 'no' || /^opposite/.test(tags.cycleway ?? '');
  if (oneway === '-1') return { forward: contraflow, backward: true };
  if (oneway === 'yes' || oneway === 'true' || oneway === '1' || (roundabout && oneway !== 'no')) {
    return { forward: true, backward: contraflow };
  }
  return { forward: true, backward: true };
}

export interface GraphStats {
  vertices: number;
  edges: number;
  usableEdges: number;
  coveredKm: number;
}

export class RoutingGraph {
  readonly vertexCount: number;
  readonly vertexLon: Float64Array;
  readonly vertexLat: Float64Array;
  readonly edges: Edge[];
  /** Za svaki vrh: lista referenci `edge * 2 + smjer` (0 = from→to, 1 = to→from). */
  adjacency: Int32Array[] = [];
  component = new Int32Array(0);
  componentSize: number[] = [];
  private snapGrid = new Map<number, number[]>();
  private readonly snapCell = 100;
  hasCycleways = false;

  constructor(network: OsmNetwork) {
    const coordIndex = new Map<number, number>();
    const nodeLon: number[] = [];
    const nodeLat: number[] = [];
    for (let i = 0; i < network.nodes.length; i += 3) {
      coordIndex.set(network.nodes[i], nodeLon.length);
      nodeLon.push(network.nodes[i + 1]);
      nodeLat.push(network.nodes[i + 2]);
    }

    const kept: Array<{ way: OsmWay; cls: WayClass; idx: number[] }> = [];
    const refCount = new Uint16Array(nodeLon.length);
    for (const way of network.ways) {
      const cls = classifyWay(way.tags);
      if (cls === 'excluded') continue;
      const idx = way.nodes.map((id) => coordIndex.get(id)).filter((v): v is number => v !== undefined);
      if (idx.length < 2) continue;
      kept.push({ way, cls, idx });
      for (let i = 0; i < idx.length; i++) {
        const isEnd = i === 0 || i === idx.length - 1;
        refCount[idx[i]] = Math.min(65535, refCount[idx[i]] + (isEnd ? 2 : 1));
      }
    }

    // Vrhovi grafa: čvorovi s ≥2 reference (raskrižja) ili krajevi putova.
    const vertexOf = new Int32Array(nodeLon.length).fill(-1);
    const vLon: number[] = [];
    const vLat: number[] = [];
    const vertex = (node: number): number => {
      if (vertexOf[node] < 0) {
        vertexOf[node] = vLon.length;
        vLon.push(nodeLon[node]);
        vLat.push(nodeLat[node]);
      }
      return vertexOf[node];
    };

    this.edges = [];
    for (const { way, cls, idx } of kept) {
      const { forward, backward } = wayDirections(way.tags);
      const roundabout = way.tags.junction === 'roundabout' || way.tags.junction === 'circular';
      let start = 0;
      for (let i = 1; i < idx.length; i++) {
        if (i < idx.length - 1 && refCount[idx[i]] < 2) continue;
        const slice = idx.slice(start, i + 1);
        const coords = new Float64Array(slice.length * 2);
        slice.forEach((n, k) => {
          coords[k * 2] = nodeLon[n];
          coords[k * 2 + 1] = nodeLat[n];
        });
        const cum = cumulative(coords);
        const length = cum[cum.length - 1];
        if (length > 0) {
          this.edges.push({
            from: vertex(slice[0]),
            to: vertex(slice[slice.length - 1]),
            coords,
            cum,
            length,
            covered: 0,
            name: way.tags.name ?? way.tags.ref ?? null,
            highway: way.tags.highway,
            roundabout,
            forward,
            backward,
            conditional: cls === 'conditional',
            usable: cls === 'legal',
            wayId: way.id,
          });
        }
        start = i;
      }
    }

    this.vertexCount = vLon.length;
    this.vertexLon = Float64Array.from(vLon);
    this.vertexLat = Float64Array.from(vLat);
    this.applyCycleways(null, 1);
  }

  /**
   * Prostorno povezuje bridove s biciklističkim stazama (GeoJSON) i ponovno
   * gradi susjedstvo, komponente povezanosti i indeks za lijepljenje točaka.
   */
  applyCycleways(index: CyclewayIndex | null, footwayThreshold: number): void {
    this.hasCycleways = index !== null;
    for (const e of this.edges) {
      e.covered = index ? lineCoverage(index, e.coords).coveredM : 0;
      e.usable = !e.conditional || (e.length > 0 && e.covered / e.length >= footwayThreshold);
    }
    this.buildAdjacency();
    this.buildComponents();
    this.buildSnapGrid();
  }

  private buildAdjacency(): void {
    const lists: number[][] = Array.from({ length: this.vertexCount }, () => []);
    this.edges.forEach((e, i) => {
      if (!e.usable) return;
      if (e.forward) lists[e.from].push(i * 2);
      if (e.backward) lists[e.to].push(i * 2 + 1);
    });
    this.adjacency = lists.map((l) => Int32Array.from(l));
  }

  /** Slabo povezane komponente (bez obzira na smjer) – za otkrivanje nepovezanih točaka. */
  private buildComponents(): void {
    const parent = new Int32Array(this.vertexCount).map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    for (const e of this.edges) {
      if (!e.usable) continue;
      const a = find(e.from);
      const b = find(e.to);
      if (a !== b) parent[a] = b;
    }
    const ids = new Map<number, number>();
    this.component = new Int32Array(this.vertexCount);
    this.componentSize = [];
    for (let v = 0; v < this.vertexCount; v++) {
      const root = find(v);
      let id = ids.get(root);
      if (id === undefined) {
        id = this.componentSize.length;
        ids.set(root, id);
        this.componentSize.push(0);
      }
      this.component[v] = id;
      this.componentSize[id]++;
    }
  }

  private buildSnapGrid(): void {
    this.snapGrid = new Map();
    const c = this.snapCell;
    this.edges.forEach((e, ei) => {
      if (!e.usable) return;
      const minX = Math.floor(Math.min(...lonRange(e.coords).map(toX)) / c);
      const maxX = Math.floor(Math.max(...lonRange(e.coords).map(toX)) / c);
      const minY = Math.floor(Math.min(...latRange(e.coords).map(toY)) / c);
      const maxY = Math.floor(Math.max(...latRange(e.coords).map(toY)) / c);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const key = x * 1e7 + y;
          const bucket = this.snapGrid.get(key);
          if (bucket) bucket.push(ei);
          else this.snapGrid.set(key, [ei]);
        }
      }
    });
  }

  /** Najbliža točka na prohodnom bridu dovoljno velike komponente mreže. */
  snap(lon: number, lat: number, maxDistanceM: number, minComponentSize: number): Snap | null {
    const px = toX(lon);
    const py = toY(lat);
    const c = this.snapCell;
    const cx = Math.floor(px / c);
    const cy = Math.floor(py / c);
    const rings = Math.ceil(maxDistanceM / c);
    let best: Snap | null = null;
    const seen = new Set<number>();

    for (let r = 0; r <= rings; r++) {
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          for (const ei of this.snapGrid.get(x * 1e7 + y) ?? []) {
            if (seen.has(ei)) continue;
            seen.add(ei);
            const e = this.edges[ei];
            if (this.componentSize[this.component[e.from]] < minComponentSize) continue;
            for (let i = 2; i < e.coords.length; i += 2) {
              const p = projectOnSegment(
                px,
                py,
                toX(e.coords[i - 2]),
                toY(e.coords[i - 1]),
                toX(e.coords[i]),
                toY(e.coords[i + 1]),
              );
              if (p.distance <= maxDistanceM && (!best || p.distance < best.distanceM)) {
                const k = i / 2;
                best = {
                  edge: ei,
                  along: e.cum[k - 1] + p.t * (e.cum[k] - e.cum[k - 1]),
                  lon: e.coords[i - 2] + p.t * (e.coords[i] - e.coords[i - 2]),
                  lat: e.coords[i - 1] + p.t * (e.coords[i + 1] - e.coords[i - 1]),
                  distanceM: p.distance,
                };
              }
            }
          }
        }
      }
      // Kada je najbolji kandidat bliži od unutarnjeg ruba sljedećeg prstena, gotovi smo.
      const found = best as Snap | null;
      if (found && found.distanceM <= r * c) break;
    }
    return best;
  }

  componentOfSnap(s: Snap): number {
    return this.component[this.edges[s.edge].from];
  }

  stats(): GraphStats {
    let usable = 0;
    let covered = 0;
    for (const e of this.edges) {
      if (e.usable) usable++;
      covered += e.covered;
    }
    return { vertices: this.vertexCount, edges: this.edges.length, usableEdges: usable, coveredKm: covered / 1000 };
  }
}

function cumulative(coords: Float64Array): Float64Array {
  const n = coords.length / 2;
  const cum = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    cum[k] =
      cum[k - 1] +
      Math.hypot(toX(coords[k * 2]) - toX(coords[k * 2 - 2]), toY(coords[k * 2 + 1]) - toY(coords[k * 2 - 1]));
  }
  return cum;
}

function lonRange(coords: Float64Array): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    if (coords[i] < min) min = coords[i];
    if (coords[i] > max) max = coords[i];
  }
  return [min, max];
}

function latRange(coords: Float64Array): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 1; i < coords.length; i += 2) {
    if (coords[i] < min) min = coords[i];
    if (coords[i] > max) max = coords[i];
  }
  return [min, max];
}

/** Dio geometrije brida između dvije udaljenosti duž brida, orijentiran od `fromAlong` prema `toAlong`. */
export function sliceEdge(edge: Edge, fromAlong: number, toAlong: number): Array<[number, number]> {
  const reverse = fromAlong > toAlong;
  const a = Math.max(0, Math.min(fromAlong, toAlong));
  const b = Math.min(edge.length, Math.max(fromAlong, toAlong));
  const pts: Array<[number, number]> = [pointAt(edge, a)];
  for (let k = 0; k < edge.cum.length; k++) {
    if (edge.cum[k] > a && edge.cum[k] < b) pts.push([edge.coords[k * 2], edge.coords[k * 2 + 1]]);
  }
  pts.push(pointAt(edge, b));
  return reverse ? pts.reverse() : pts;
}

function pointAt(edge: Edge, along: number): [number, number] {
  const { cum, coords } = edge;
  if (along <= 0) return [coords[0], coords[1]];
  for (let k = 1; k < cum.length; k++) {
    if (cum[k] >= along) {
      const span = cum[k] - cum[k - 1];
      const t = span === 0 ? 0 : (along - cum[k - 1]) / span;
      return [
        coords[k * 2 - 2] + t * (coords[k * 2] - coords[k * 2 - 2]),
        coords[k * 2 - 1] + t * (coords[k * 2 + 1] - coords[k * 2 - 1]),
      ];
    }
  }
  return [coords[coords.length - 2], coords[coords.length - 1]];
}
