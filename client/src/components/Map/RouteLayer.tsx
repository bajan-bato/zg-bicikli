import type { LatLngExpression } from 'leaflet';
import { Polyline } from 'react-leaflet';
import type { LngLat, RouteResult } from '../../types';
import { routeCasingStyle, routeRoadStyle, routeStyle } from './mapStyles';

const toLatLngs = (coords: LngLat[]): LatLngExpression[] => coords.map(([lon, lat]) => [lat, lon]);

/**
 * Izračunata ruta u dvije boje na bijelom obrubu: puna ljubičasta gdje ide
 * biciklističkom stazom, isprekidana narančasta gdje vozi cestom bez staze.
 */
export function RouteLayer({ route }: { route: RouteResult }) {
  return (
    <>
      <Polyline pane="route" positions={toLatLngs(route.geometry.coordinates)} pathOptions={routeCasingStyle} interactive={false} />
      {route.roadSegments.map((seg, i) => (
        <Polyline key={`r${i}`} pane="route" positions={toLatLngs(seg)} pathOptions={routeRoadStyle} interactive={false} />
      ))}
      {route.cyclewaySegments.map((seg, i) => (
        <Polyline key={`c${i}`} pane="route" positions={toLatLngs(seg)} pathOptions={routeStyle} interactive={false} />
      ))}
    </>
  );
}
