import type { PublicConfig, RouteResult } from '../types';

/** Ravna testna ruta istok-zapad (~1550 m) samo za jedinične testove navigacije. */
export const BASE: [number, number] = [15.97, 45.8];
export const M_LON = 1 / (111_195 * Math.cos((45.8 * Math.PI) / 180));
export const M_LAT = 1 / 111_195;
export const pt = (x: number, y = 0): [number, number] => [BASE[0] + x * M_LON, BASE[1] + y * M_LAT];

export const navConfig: PublicConfig['navigation'] = {
  offRouteThresholdM: 35,
  offRouteConfirmations: 3,
  offRouteMinDurationMs: 4000,
  maxAcceptableAccuracyM: 50,
  arrivalRadiusM: 25,
  rerouteCooldownMs: 10000,
};

export function testRoute(over: Partial<RouteResult> = {}): RouteResult {
  const coords = [pt(0), pt(500), pt(1000), pt(1550)];
  return {
    id: 'r1',
    mode: 'cycleways',
    geometry: { type: 'LineString', coordinates: coords },
    distanceM: 1550,
    durationS: 372,
    cyclewayDistanceM: 1000,
    cyclewayShare: 0.645,
    roadDistanceM: 550,
    cyclewaySegments: [[pt(0), pt(1000)]],
    instructions: [
      { type: 'depart', modifier: null, text: 'Krenite prema istoku – Savska cesta', streetName: 'Savska cesta', onCycleway: true, distanceM: 500, alongM: 0, location: pt(0) },
      { type: 'turn', modifier: 'left', text: 'Skrenite lijevo – Ilica', streetName: 'Ilica', onCycleway: true, distanceM: 500, alongM: 500, location: pt(500) },
      { type: 'turn', modifier: 'right', text: 'Skrenite desno – Vlaška', streetName: 'Vlaška', onCycleway: false, distanceM: 550, alongM: 1000, location: pt(1000) },
      { type: 'arrive', modifier: null, text: 'Stigli ste na odredište', streetName: null, onCycleway: false, distanceM: 0, alongM: 1550, location: pt(1550) },
    ],
    snappedStart: pt(0),
    snappedEnd: pt(1550),
    penaltyUsed: 1.5,
    shortestDistanceM: 1400,
    averageSpeedKmh: 15,
    computeMs: 5,
    ...over,
  };
}
