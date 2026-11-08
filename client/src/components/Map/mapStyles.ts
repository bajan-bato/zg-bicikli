import L from 'leaflet';
import type { PathOptions } from 'leaflet';

/** Jedinstvena paleta karte: infrastruktura (tirkizna) ≠ izračunata ruta (ljubičasta). */
export const COLORS = {
  cycleway: '#0d9488',
  cyclewayCasing: '#ffffff',
  route: '#6d28d9',
  routeCasing: '#ffffff',
  routeOnRoad: '#ea580c',
  start: '#16a34a',
  end: '#dc2626',
  user: '#2563eb',
  parking: '#1e3a8a',
} as const;

export function cyclewayStyle(highlighted = false): PathOptions {
  return {
    color: COLORS.cycleway,
    weight: highlighted ? 8 : 5,
    opacity: highlighted ? 1 : 0.8,
    lineCap: 'round',
    lineJoin: 'round',
  };
}

export const routeCasingStyle: PathOptions = { color: COLORS.routeCasing, weight: 12, opacity: 0.95, lineCap: 'round', lineJoin: 'round' };
/** Dio rute po biciklističkoj stazi: puna ljubičasta linija. */
export const routeStyle: PathOptions = { color: COLORS.route, weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round' };
/** Dio rute bez staze (vožnja cestom): isprekidana narančasta linija. */
export const routeRoadStyle: PathOptions = {
  color: COLORS.routeOnRoad,
  weight: 6,
  opacity: 1,
  dashArray: '12 9',
  lineCap: 'butt',
  lineJoin: 'round',
};

const pin = (color: string, letter: string) =>
  L.divIcon({
    className: 'map-pin',
    html: `<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 41s13-14.1 13-24A13 13 0 0 0 3 17c0 9.9 13 24 13 24z" fill="${color}" stroke="#fff" stroke-width="2.5"/><text x="16" y="21.5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="Inter,system-ui,sans-serif">${letter}</text></svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 41],
    popupAnchor: [0, -36],
  });

export const startIcon = pin(COLORS.start, 'A');
export const endIcon = pin(COLORS.end, 'B');

export const parkingIcon = L.divIcon({
  className: 'parking-icon',
  html: `<span class="parking-icon__badge" aria-label="Parkiralište za bicikle"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="6" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 16l4-7h5l3 7M10 9l3 7M14 6h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

export function userIcon(heading: number | null): L.DivIcon {
  const arrow =
    heading !== null && Number.isFinite(heading)
      ? `<span class="user-dot__heading" style="transform:rotate(${heading}deg)"></span>`
      : '';
  return L.divIcon({
    className: 'user-dot',
    html: `${arrow}<span class="user-dot__core"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}
