import type { CyclewayCollection } from '../../../../shared/types/index.js';
import { axisDifference, planarBearing, projectOnSegment, toX, toY } from '../../utils/geo.js';

/** Dopušteno prekoračenje kraja segmenta staze (m) – pokriva spojeve segmenata u zavojima. */
const END_SLACK_M = 3;

export interface MatchOptions {
  toleranceM: number;
  bearingToleranceDeg: number;
  sampleSpacingM: number;
}

/**
 * Prostorni indeks (pravilna mreža ćelija) nad segmentima biciklističkih staza
 * iz GeoJSON-a Grada Zagreba. Služi za utvrđivanje stvarnog preklapanja
 * cestovnih segmenata i rute s geometrijom staza.
 */
export class CyclewayIndex {
  private readonly ax: Float64Array;
  private readonly ay: Float64Array;
  private readonly bx: Float64Array;
  private readonly by: Float64Array;
  private readonly bearing: Float64Array;
  private readonly feature: Int32Array;
  private readonly grid = new Map<number, number[]>();
  readonly segmentCount: number;

  constructor(
    collection: CyclewayCollection,
    readonly options: MatchOptions,
    private readonly cellSize = 60,
  ) {
    const segs: number[] = [];
    collection.features.forEach((f, fi) => {
      for (const line of f.geometry.coordinates) {
        for (let i = 1; i < line.length; i++) {
          const [lon1, lat1] = line[i - 1];
          const [lon2, lat2] = line[i];
          if (lon1 === lon2 && lat1 === lat2) continue;
          segs.push(toX(lon1), toY(lat1), toX(lon2), toY(lat2), fi);
        }
      }
    });
    const n = segs.length / 5;
    this.segmentCount = n;
    this.ax = new Float64Array(n);
    this.ay = new Float64Array(n);
    this.bx = new Float64Array(n);
    this.by = new Float64Array(n);
    this.bearing = new Float64Array(n);
    this.feature = new Int32Array(n);
    const pad = options.toleranceM;
    for (let i = 0; i < n; i++) {
      const ax = segs[i * 5];
      const ay = segs[i * 5 + 1];
      const bx = segs[i * 5 + 2];
      const by = segs[i * 5 + 3];
      this.ax[i] = ax;
      this.ay[i] = ay;
      this.bx[i] = bx;
      this.by[i] = by;
      this.bearing[i] = planarBearing(ax, ay, bx, by);
      this.feature[i] = segs[i * 5 + 4];
      const c0x = Math.floor((Math.min(ax, bx) - pad) / cellSize);
      const c1x = Math.floor((Math.max(ax, bx) + pad) / cellSize);
      const c0y = Math.floor((Math.min(ay, by) - pad) / cellSize);
      const c1y = Math.floor((Math.max(ay, by) + pad) / cellSize);
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let cy = c0y; cy <= c1y; cy++) {
          const key = cx * 1e7 + cy;
          const bucket = this.grid.get(key);
          if (bucket) bucket.push(i);
          else this.grid.set(key, [i]);
        }
      }
    }
  }

  /**
   * Vraća indeks GeoJSON objekta staze koja prolazi unutar tolerancije od točke
   * i približno je paralelna sa zadanim smjerom, ili -1.
   */
  match(x: number, y: number, bearing: number): number {
    const bucket = this.grid.get(Math.floor(x / this.cellSize) * 1e7 + Math.floor(y / this.cellSize));
    if (!bucket) return -1;
    let best = -1;
    let bestDist = this.options.toleranceM;
    for (const i of bucket) {
      if (axisDifference(bearing, this.bearing[i]) > this.options.bearingToleranceDeg) continue;
      // Točka mora ležati "uz" segment, a ne iza njegova kraja – inače bi se
      // preklapanje produljilo za cijelu toleranciju na svakom kraju staze.
      const dx = this.bx[i] - this.ax[i];
      const dy = this.by[i] - this.ay[i];
      const len = Math.hypot(dx, dy);
      const along = ((x - this.ax[i]) * dx + (y - this.ay[i]) * dy) / len;
      if (along < -END_SLACK_M || along > len + END_SLACK_M) continue;
      const d = projectOnSegment(x, y, this.ax[i], this.ay[i], this.bx[i], this.by[i]).distance;
      if (d <= bestDist) {
        bestDist = d;
        best = this.feature[i];
      }
    }
    return best;
  }
}

export interface LineCoverage {
  totalM: number;
  coveredM: number;
  /** Intervali [od, do] u metrima duž linije koji se poklapaju sa stazama. */
  intervals: Array<[number, number]>;
}

/**
 * Prostorno preklapanje polilinije (ravni niz [lon, lat, ...]) sa stazama.
 * Linija se uzorkuje svakih `sampleSpacingM` metara; svaki uzorak predstavlja
 * svoj dio duljine. Rezultat je stvarna duljina preklapanja, a ne zbroj
 * duljina staza u blizini.
 */
export function lineCoverage(index: CyclewayIndex | null, coords: ArrayLike<number>): LineCoverage {
  const intervals: Array<[number, number]> = [];
  let total = 0;
  let covered = 0;
  const spacing = index?.options.sampleSpacingM ?? 5;

  for (let i = 2; i < coords.length; i += 2) {
    const ax = toX(coords[i - 2]);
    const ay = toY(coords[i - 1]);
    const bx = toX(coords[i]);
    const by = toY(coords[i + 1]);
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    if (index) {
      const bearing = planarBearing(ax, ay, bx, by);
      const pieces = Math.max(1, Math.ceil(len / spacing));
      const pieceLen = len / pieces;
      for (let k = 0; k < pieces; k++) {
        const t = (k + 0.5) / pieces;
        if (index.match(ax + (bx - ax) * t, ay + (by - ay) * t, bearing) >= 0) {
          const from = total + k * pieceLen;
          const to = from + pieceLen;
          covered += pieceLen;
          const last = intervals[intervals.length - 1];
          if (last && Math.abs(last[1] - from) < 1e-6) last[1] = to;
          else intervals.push([from, to]);
        }
      }
    }
    total += len;
  }
  return { totalM: total, coveredM: covered, intervals };
}
