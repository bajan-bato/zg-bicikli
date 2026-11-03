import type { LatLngExpression } from 'leaflet';
import { Polyline } from 'react-leaflet';
import type { LngLat, RouteResult } from '../../types';
import { routeCasingStyle, routeCyclewayStyle, routeStyle } from './mapStyles';

const toLatLngs = (coords: LngLat[]): LatLngExpression[] => coords.map(([lon, lat]) => [lat, lon]);

/** Izračunata ruta: ljubičasta s bijelim obrubom; dijelovi po stazama označeni isprekidano. */
export function RouteLayer({ route, dimmed = false }: { route: RouteResult; dimmed?: boolean }) {
  const line = toLatLngs(route.geometry.coordinates);
  return (
    <>
      <Polyline pane="route" positions={line} pathOptions={routeCasingStyle} interactive={false} />
      <Polyline pane="route" positions={line} pathOptions={{ ...routeStyle, opacity: dimmed ? 0.55 : 1 }} interactive={false} />
      {route.cyclewaySegments.map((seg, i) => (
        <Polyline key={i} pane="route" positions={toLatLngs(seg)} pathOptions={routeCyclewayStyle} interactive={false} />
      ))}
    </>
  );
}
