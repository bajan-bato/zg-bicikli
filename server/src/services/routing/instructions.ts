import type { Instruction, LngLat, TurnModifier } from '../../../../shared/types/index.js';
import { planarBearing, toX, toY, turnAngle } from '../../utils/geo.js';

/**
 * Generiranje navigacijskih uputa na hrvatskom jeziku iz niza dionica rute.
 * Vlastiti routing engine nema "tuđe" upute pa nije potreban prijevod –
 * tekst se gradi izravno na hrvatskom.
 */

export interface Leg {
  coords: LngLat[];
  lengthM: number;
  startAlong: number;
  name: string | null;
  highway: string;
  roundabout: boolean;
  /** Udio dionice koji se prostorno poklapa s biciklističkom stazom. */
  cyclewayShare: number;
}

interface Step {
  legs: Leg[];
  name: string | null;
  highway: string;
  roundabout: boolean;
  onCycleway: boolean;
  length: number;
  startAlong: number;
}

const MIN_STEP_M = 15;
const BEARING_SAMPLE_M = 20;

const TYPE_LABELS: Record<string, string> = {
  cycleway: 'biciklistička staza',
  path: 'staza',
  footway: 'pješačko-biciklistička staza',
  pedestrian: 'pješačka zona',
  service: 'servisna cesta',
  track: 'poljski put',
  living_street: 'stambena ulica',
};

export function streetLabel(name: string | null, highway: string): string {
  return name ?? TYPE_LABELS[highway] ?? 'neimenovana cesta';
}

const key = (leg: Pick<Leg, 'name' | 'highway'>): string => leg.name ?? `~${leg.highway}`;

export function modifierFromAngle(angle: number): TurnModifier {
  const a = Math.abs(angle);
  const side = angle < 0 ? 'left' : 'right';
  if (a < 25) return 'straight';
  if (a < 60) return `slight-${side}` as TurnModifier;
  if (a < 135) return side;
  if (a < 170) return `sharp-${side}` as TurnModifier;
  return 'uturn';
}

const VERBS: Record<TurnModifier, string> = {
  straight: 'Nastavite ravno',
  'slight-left': 'Blago skrenite lijevo',
  'slight-right': 'Blago skrenite desno',
  left: 'Skrenite lijevo',
  right: 'Skrenite desno',
  'sharp-left': 'Oštro skrenite lijevo',
  'sharp-right': 'Oštro skrenite desno',
  uturn: 'Okrenite se',
};

/** Dativ (“prema sjeveru”). */
const CARDINALS = ['sjeveru', 'sjeveroistoku', 'istoku', 'jugoistoku', 'jugu', 'jugozapadu', 'zapadu', 'sjeverozapadu'];
export const cardinal = (bearing: number): string => CARDINALS[Math.round(bearing / 45) % 8];

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace('.', ',')} km`;
  if (m >= 100) return `${Math.round(m / 50) * 50} m`;
  return `${Math.max(5, Math.round(m / 5) * 5)} m`;
}

/** Smjer na početku (atEnd=false) ili kraju (atEnd=true) niza točaka, mjeren na ~20 m. */
function bearingOf(coords: LngLat[], atEnd: boolean): number {
  const pts = atEnd ? [...coords].reverse() : coords;
  const [x0, y0] = [toX(pts[0][0]), toY(pts[0][1])];
  let target = pts[pts.length - 1];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(toX(pts[i][0]) - toX(pts[i - 1][0]), toY(pts[i][1]) - toY(pts[i - 1][1]));
    if (acc >= BEARING_SAMPLE_M) {
      target = pts[i];
      break;
    }
  }
  const b = planarBearing(x0, y0, toX(target[0]), toY(target[1]));
  return atEnd ? (b + 180) % 360 : b;
}

function groupSteps(legs: Leg[]): Step[] {
  const steps: Step[] = [];
  for (const leg of legs) {
    const onCycleway = leg.cyclewayShare >= 0.5;
    const last = steps[steps.length - 1];
    if (last && key(last) === key(leg) && last.onCycleway === onCycleway && last.roundabout === leg.roundabout) {
      last.legs.push(leg);
      last.length += leg.lengthM;
    } else {
      steps.push({
        legs: [leg],
        name: leg.name,
        highway: leg.highway,
        roundabout: leg.roundabout,
        onCycleway,
        length: leg.lengthM,
        startAlong: leg.startAlong,
      });
    }
  }
  // Vrlo kratke međudionice (npr. prijelaz preko raskrižja) pripajaju se prethodnoj.
  const merged: Step[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const prev = merged[merged.length - 1];
    if (prev && s.length < MIN_STEP_M && i < steps.length - 1 && !s.roundabout) {
      prev.legs.push(...s.legs);
      prev.length += s.length;
      continue;
    }
    if (prev && key(prev) === key(s) && prev.onCycleway === s.onCycleway && prev.roundabout === s.roundabout) {
      prev.legs.push(...s.legs);
      prev.length += s.length;
      continue;
    }
    merged.push(s);
  }
  return merged;
}

const stepCoords = (s: Step): LngLat[] => s.legs.flatMap((l) => l.coords);

export function buildInstructions(legs: Leg[], end: LngLat, totalM: number): Instruction[] {
  const steps = groupSteps(legs.filter((l) => l.lengthM > 0));
  const out: Instruction[] = [];

  steps.forEach((step, i) => {
    const coords = stepCoords(step);
    const label = streetLabel(step.name, step.highway);
    const location = coords[0];
    const then = ` i vozite ${formatDistance(step.length)}`;

    if (i === 0) {
      const dir = cardinal(bearingOf(coords, false));
      const text = step.onCycleway
        ? `Krenite prema ${dir} biciklističkom stazom – ${label}`
        : `Krenite prema ${dir} – ${label}`;
      out.push({ type: 'depart', modifier: null, text: text + then, streetName: step.name, onCycleway: step.onCycleway, distanceM: step.length, alongM: step.startAlong, location });
      return;
    }

    const prev = steps[i - 1];
    const modifier = modifierFromAngle(turnAngle(bearingOf(stepCoords(prev), true), bearingOf(coords, false)));
    let text: string;
    if (step.roundabout) {
      text = `Uđite u kružni tok – ${label}`;
    } else if (prev.roundabout) {
      text = `Izađite iz kružnog toka – ${label}`;
    } else if (modifier === 'straight' && key(prev) === key(step)) {
      text = step.onCycleway ? `Nastavite biciklističkom stazom – ${label}` : `Biciklistička staza završava, nastavite – ${label}`;
    } else if (step.onCycleway) {
      text = modifier === 'straight' ? `Nastavite biciklističkom stazom – ${label}` : `${VERBS[modifier]} na biciklističku stazu – ${label}`;
    } else {
      text = `${VERBS[modifier]} – ${label}`;
    }
    out.push({
      type: modifier === 'straight' ? 'continue' : 'turn',
      modifier,
      text: text + then,
      streetName: step.name,
      onCycleway: step.onCycleway,
      distanceM: step.length,
      alongM: step.startAlong,
      location,
    });
  });

  out.push({ type: 'arrive', modifier: null, text: 'Stigli ste na odredište', streetName: null, onCycleway: false, distanceM: 0, alongM: totalM, location: end });
  return out;
}
