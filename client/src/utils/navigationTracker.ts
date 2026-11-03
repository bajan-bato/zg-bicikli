import type { Instruction, PublicConfig, RouteResult } from '../types';
import { DeviationDetector, type DeviationState } from './deviation';
import { haversineM, routeProgress } from './routeProgress';

export interface GpsFix {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
}

export type NavStatus = 'navigating' | 'weak-signal' | 'off-route' | 'rerouting' | 'arrived';

export interface NavSnapshot {
  status: NavStatus;
  deviation: DeviationState;
  distanceFromRouteM: number;
  alongM: number;
  remainingM: number;
  remainingS: number;
  traveledM: number;
  nextInstruction: Instruction | null;
  distanceToNextM: number;
  /** Tekuća dionica (posljednja prođena uputa). */
  currentInstruction: Instruction | null;
  /** true kad treba zatražiti novu rutu (odstupanje potvrđeno, istekao cooldown). */
  shouldReroute: boolean;
}

export type NavOptions = PublicConfig['navigation'];

/**
 * Čista logika navigacije (bez Reacta i preglednika) – lako se testira.
 * Hook useNavigation joj predaje GPS mjerenja i reagira na `shouldReroute`.
 */
export class NavigationTracker {
  private detector: DeviationDetector;
  private traveled = 0;
  private lastFix: GpsFix | null = null;
  private lastRerouteAt = -Infinity;
  private maxAlong = 0;

  constructor(
    private route: RouteResult,
    private readonly opts: NavOptions,
  ) {
    this.detector = new DeviationDetector({
      thresholdM: opts.offRouteThresholdM,
      confirmations: opts.offRouteConfirmations,
      minDurationMs: opts.offRouteMinDurationMs,
      maxAccuracyM: opts.maxAcceptableAccuracyM,
    });
  }

  get currentRoute(): RouteResult {
    return this.route;
  }

  /** Nova ruta nakon preračunavanja – prijeđena udaljenost se zadržava. */
  setRoute(route: RouteResult): void {
    this.route = route;
    this.detector.reset();
    this.maxAlong = 0;
  }

  markRerouteRequested(now: number): void {
    this.lastRerouteAt = now;
  }

  update(fix: GpsFix): NavSnapshot {
    const coords = this.route.geometry.coordinates;
    const accurate = fix.accuracy <= this.opts.maxAcceptableAccuracyM;

    if (accurate) {
      if (this.lastFix) {
        const moved = haversineM(this.lastFix.lon, this.lastFix.lat, fix.lon, fix.lat);
        // Filtar podrhtavanja GPS-a dok korisnik stoji.
        if (moved >= Math.max(3, fix.accuracy * 0.25)) {
          this.traveled += moved;
          this.lastFix = fix;
        }
      } else {
        this.lastFix = fix;
      }
    }

    const progress = routeProgress(coords, fix.lon, fix.lat);
    const deviation = this.detector.update({ distanceM: progress.distanceFromRouteM, accuracyM: fix.accuracy, timestamp: fix.timestamp });
    if (deviation === 'on-route') this.maxAlong = Math.max(this.maxAlong, progress.alongM);
    const along = deviation === 'on-route' ? progress.alongM : this.maxAlong;

    const remainingM = Math.max(0, this.route.distanceM - along);
    const speed = this.route.averageSpeedKmh / 3.6;
    const end = coords[coords.length - 1];
    const toEnd = haversineM(fix.lon, fix.lat, end[0], end[1]);
    const arrived = accurate && toEnd <= Math.max(this.opts.arrivalRadiusM, Math.min(fix.accuracy, 40));

    const instructions = this.route.instructions;
    const next = instructions.find((i) => i.type !== 'depart' && i.alongM > along + 3) ?? null;
    const current = [...instructions].reverse().find((i) => i.type !== 'arrive' && i.alongM <= along + 3) ?? null;

    let status: NavStatus = 'navigating';
    let shouldReroute = false;
    if (arrived) status = 'arrived';
    else if (deviation === 'off-route') {
      status = 'off-route';
      if (fix.timestamp - this.lastRerouteAt >= this.opts.rerouteCooldownMs) shouldReroute = true;
    } else if (deviation === 'uncertain') status = 'weak-signal';

    return {
      status,
      deviation,
      distanceFromRouteM: progress.distanceFromRouteM,
      alongM: along,
      remainingM: arrived ? 0 : Math.max(remainingM, deviation === 'on-route' ? 0 : toEnd),
      remainingS: (arrived ? 0 : remainingM) / speed,
      traveledM: this.traveled,
      nextInstruction: arrived ? null : next,
      distanceToNextM: next ? Math.max(0, next.alongM - along) : 0,
      currentInstruction: current,
      shouldReroute,
    };
  }
}
