import { createHash } from 'node:crypto';
import type { CyclewayCollection, HealthStatus, LatLon, RouteMode, RouteResult } from '../../../../shared/types/index.js';
import { config, type RoutingConfig } from '../../config/index.js';
import { AppError, ErrorCodes, errorMessage } from '../../utils/errors.js';
import { LruCache } from '../../utils/lru.js';
import { astar, type PathPiece } from './astar.js';
import { CyclewayIndex } from './cyclewayIndex.js';
import { RoutingGraph, type Snap } from './graph.js';
import type { OsmNetwork } from './osmNetwork.js';
import { buildRoute } from './routeBuilder.js';

type State = HealthStatus['routing']['state'];

export interface RouteOptions {
  /** Nadjačava penal za obične ceste (samo za način "cycleways"). */
  roadPenalty?: number;
  /** Nadjačava najveći dopušteni omjer prema najkraćoj ruti. */
  maxDetourFactor?: number;
}

/**
 * Vlastiti routing engine unutar monolita: drži graf u memoriji, povezuje ga s
 * biciklističkim stazama i računa rute A* algoritmom.
 */
export class RoutingService {
  private graph: RoutingGraph | null = null;
  private index: CyclewayIndex | null = null;
  private state: State = 'idle';
  private message: string | null = null;
  private osmTimestamp: string | null = null;
  private readonly cache: LruCache<string, RouteResult>;

  constructor(private readonly cfg: RoutingConfig = config.routing) {
    this.cache = new LruCache(cfg.routeCacheSize);
  }

  /** Gradi graf iz OSM mreže; pozivatelj osigurava preuzimanje (vidi index.ts). */
  async initialize(
    loadNetwork: () => Promise<OsmNetwork>,
    getCycleways: () => CyclewayCollection | null,
  ): Promise<void> {
    this.state = 'loading';
    this.message = 'Priprema cestovne mreže…';
    try {
      const network = await loadNetwork();
      this.setNetwork(network, getCycleways());
    } catch (err) {
      this.state = 'error';
      this.message = `Routing engine nije dostupan: ${errorMessage(err)}`;
      console.error(`[routing] ${this.message}`);
    }
  }

  setNetwork(network: OsmNetwork, cycleways: CyclewayCollection | null): void {
    const started = Date.now();
    const graph = new RoutingGraph(network);
    this.osmTimestamp = network.osmTimestamp;
    this.graph = graph;
    this.updateCycleways(cycleways);
    this.state = 'ready';
    this.message = null;
    const s = graph.stats();
    console.log(
      `[routing] Graf spreman za ${Date.now() - started} ms: ${s.vertices} vrhova, ${s.edges} bridova (${s.usableEdges} prohodnih), ${s.coveredKm.toFixed(1)} km bridova uz biciklističke staze`,
    );
  }

  /** Ponovno prostorno povezivanje nakon osvježavanja podataka o stazama. */
  updateCycleways(cycleways: CyclewayCollection | null): void {
    this.index = cycleways
      ? new CyclewayIndex(cycleways, {
          toleranceM: this.cfg.cyclewayMatchToleranceM,
          bearingToleranceDeg: this.cfg.cyclewayBearingToleranceDeg,
          sampleSpacingM: this.cfg.sampleSpacingM,
        })
      : null;
    this.graph?.applyCycleways(this.index, this.cfg.footwayCoverageThreshold);
    this.cache.clear();
  }

  health(): HealthStatus['routing'] {
    const s = this.graph?.stats();
    return {
      state: this.state,
      message: this.message,
      vertices: s?.vertices ?? 0,
      edges: s?.edges ?? 0,
      cyclewayCoveredKm: Math.round((s?.coveredKm ?? 0) * 10) / 10,
      osmTimestamp: this.osmTimestamp,
    };
  }

  private requireGraph(): RoutingGraph {
    if (this.state !== 'ready' || !this.graph) {
      throw new AppError(
        503,
        ErrorCodes.ROUTING_UNAVAILABLE,
        this.state === 'loading' || this.state === 'idle'
          ? 'Routing engine se još priprema (preuzimanje i obrada cestovne mreže). Pokušajte za minutu.'
          : (this.message ?? 'Routing engine nije dostupan.'),
      );
    }
    return this.graph;
  }

  private snapPoint(graph: RoutingGraph, p: LatLon, label: string): Snap {
    const [w, s, e, n] = config.area.bbox;
    if (p.lon < w || p.lon > e || p.lat < s || p.lat > n) {
      throw new AppError(422, ErrorCodes.OUTSIDE_AREA, `${label} je izvan područja Grada Zagreba koje aplikacija pokriva.`);
    }
    const snap = graph.snap(p.lon, p.lat, this.cfg.snapMaxDistanceM, this.cfg.minComponentSize);
    if (!snap) {
      throw new AppError(
        422,
        ErrorCodes.ROUTE_NOT_FOUND,
        `${label} je predaleko od cestovne mreže dostupne biciklistima (više od ${this.cfg.snapMaxDistanceM} m).`,
      );
    }
    return snap;
  }

  route(start: LatLon, end: LatLon, mode: RouteMode, options: RouteOptions = {}): RouteResult {
    const graph = this.requireGraph();
    if (mode === 'cycleways' && !this.index) {
      throw new AppError(
        503,
        ErrorCodes.DATA_UNAVAILABLE,
        'Podaci o biciklističkim stazama još nisu dostupni pa ruta s prioritetom staza nije moguća. Koristite najkraću rutu.',
      );
    }
    const penalty = options.roadPenalty ?? this.cfg.roadPenalty;
    const detour = options.maxDetourFactor ?? this.cfg.maxDetourFactor;
    const cacheKey = [start.lat, start.lon, end.lat, end.lon].map((v) => v.toFixed(5)).join(',') + `|${mode}|${penalty}|${detour}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const started = performance.now();
    const s = this.snapPoint(graph, start, 'Polazište');
    const t = this.snapPoint(graph, end, 'Odredište');
    if (graph.componentOfSnap(s) !== graph.componentOfSnap(t)) {
      throw new AppError(422, ErrorCodes.NOT_CONNECTED, 'Polazište i odredište nisu povezani cestovnom mrežom dostupnom biciklistima.');
    }

    const lengthCost = (ei: number) => graph.edges[ei].length;
    const shortest = astar(graph, s, t, lengthCost);
    if (!shortest) {
      throw new AppError(422, ErrorCodes.ROUTE_NOT_FOUND, 'Ruta između odabranih točaka nije pronađena (moguće zbog jednosmjernih ulica).');
    }
    const shortestLen = piecesLength(shortest);

    let chosen: PathPiece[] = shortest;
    let penaltyUsed = 0;
    if (mode === 'cycleways') {
      // Smanjujemo penal dok ruta ne zadovolji ograničenje duljine; p=0 je najkraća ruta.
      for (const p of penaltySchedule(penalty)) {
        const cost = (ei: number) => {
          const e = graph.edges[ei];
          return e.covered + (e.length - e.covered) * (1 + p);
        };
        const candidate = astar(graph, s, t, cost);
        if (candidate && piecesLength(candidate) <= shortestLen * detour + 1) {
          chosen = candidate;
          penaltyUsed = p;
          break;
        }
      }
    }

    const built = buildRoute(graph, this.index, chosen, this.cfg.averageSpeedKmh);
    const result: RouteResult = {
      ...built,
      id: createHash('sha1').update(`${cacheKey}|${Date.now()}`).digest('hex').slice(0, 12),
      mode,
      snappedStart: [s.lon, s.lat],
      snappedEnd: [t.lon, t.lat],
      penaltyUsed,
      shortestDistanceM: Math.round(shortestLen * 10) / 10,
      computeMs: Math.round(performance.now() - started),
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  /** Za testove i dijagnostiku. */
  getGraph(): RoutingGraph | null {
    return this.graph;
  }
}

function piecesLength(pieces: PathPiece[]): number {
  return pieces.reduce((sum, p) => sum + Math.abs(p.toAlong - p.fromAlong), 0);
}

export function penaltySchedule(penalty: number): number[] {
  if (penalty <= 0) return [0];
  return [penalty, penalty / 2, penalty / 4, penalty / 8].filter((p) => p > 0.05);
}
