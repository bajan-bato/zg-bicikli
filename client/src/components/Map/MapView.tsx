import L, { type LatLngBoundsExpression } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Pane, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { CyclewayCollection, LatLon, ParkingCollection, Place, PublicConfig, RouteResult } from '../../types';
import type { Position } from '../../hooks/useCurrentLocation';
import { ParkingLayer } from '../ParkingMarkers/ParkingLayer';
import { CyclewayLayer } from './CyclewayLayer';
import { endIcon, startIcon, userIcon } from './mapStyles';
import { RouteLayer } from './RouteLayer';

interface Props {
  config: PublicConfig;
  cycleways: CyclewayCollection | null;
  parking: ParkingCollection | null;
  showCycleways: boolean;
  showParking: boolean;
  route: RouteResult | null;
  start: Place | null;
  end: Place | null;
  user: Position | null;
  navigating: boolean;
  /** Povećanje vrijednosti centrira kartu na korisnika. */
  recenterKey: number;
  onPick: (which: 'start' | 'end', point: LatLon) => void;
}

function ClickMenu({ disabled, onPick }: { disabled: boolean; onPick: Props['onPick'] }) {
  const [point, setPoint] = useState<L.LatLng | null>(null);
  useMapEvents({
    click: (e) => {
      if (!disabled) setPoint(e.latlng);
    },
  });
  if (!point) return null;
  const pick = (which: 'start' | 'end') => {
    onPick(which, { lat: point.lat, lon: point.lng });
    setPoint(null);
  };
  return (
    <Popup position={point} eventHandlers={{ remove: () => setPoint(null) }} className="click-menu" closeButton={false}>
      <div className="click-menu__actions">
        <button type="button" className="chip chip--start" onClick={() => pick('start')}>
          <span className="dot dot--start" /> Polazište ovdje
        </button>
        <button type="button" className="chip chip--end" onClick={() => pick('end')}>
          <span className="dot dot--end" /> Odredište ovdje
        </button>
      </div>
    </Popup>
  );
}

/** Prilagodba prikaza novoj ruti (izvan navigacije). */
function FitRoute({ route, navigating }: { route: RouteResult | null; navigating: boolean }) {
  const map = useMap();
  const lastId = useRef<string | null>(null);
  useEffect(() => {
    if (!route || navigating || route.id === lastId.current) return;
    lastId.current = route.id;
    const bounds = L.latLngBounds(route.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number]));
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    map.fitBounds(bounds, {
      paddingTopLeft: mobile ? [24, 80] : [420, 80],
      paddingBottomRight: mobile ? [24, Math.round(window.innerHeight * 0.45)] : [40, 40],
      maxZoom: 17,
    });
  }, [route, navigating, map]);
  return null;
}

/** Tijekom navigacije karta prati korisnika, osim kratko nakon ručnog pomicanja. */
function FollowUser({ user, active, recenterKey }: { user: Position | null; active: boolean; recenterKey: number }) {
  const map = useMap();
  const pausedUntil = useRef(0);
  const userRef = useRef(user);
  userRef.current = user;
  useMapEvents({
    dragstart: () => {
      pausedUntil.current = Date.now() + 15_000;
    },
  });
  useEffect(() => {
    if (!active) pausedUntil.current = 0;
  }, [active]);
  useEffect(() => {
    if (recenterKey === 0) return;
    pausedUntil.current = 0;
    const u = userRef.current;
    if (u) map.setView([u.lat, u.lon], Math.max(map.getZoom(), 17), { animate: true });
  }, [recenterKey, map]);
  useEffect(() => {
    if (!active || !user || Date.now() < pausedUntil.current) return;
    map.setView([user.lat, user.lon], Math.max(map.getZoom(), 17), { animate: true });
  }, [active, user, map]);
  return null;
}

/** Fokus na korisnika kad se lokacija prvi put dohvati izvan navigacije. */
function FocusOnUser({ user, navigating }: { user: Position | null; navigating: boolean }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!user || navigating || done.current) return;
    done.current = true;
    map.setView([user.lat, user.lon], Math.max(map.getZoom(), 15));
  }, [user, navigating, map]);
  return null;
}

export function MapView(props: Props) {
  const { config, cycleways, parking, showCycleways, showParking, route, start, end, user, navigating, onPick, recenterKey } = props;
  const [w, s, e, n] = config.bbox;
  const maxBounds: LatLngBoundsExpression = [
    [s - 0.15, w - 0.25],
    [n + 0.15, e + 0.25],
  ];

  return (
    <MapContainer
      className="map"
      center={[config.mapCenter.lat, config.mapCenter.lon]}
      zoom={13}
      minZoom={11}
      maxZoom={19}
      maxBounds={maxBounds}
      zoomControl={false}
      preferCanvas
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> suradnici · Staze i parkirališta: <a href="https://data.gov.hr">Grad Zagreb, data.gov.hr</a>'
        maxZoom={19}
      />
      <Pane name="cycleways" style={{ zIndex: 410 }} />
      <Pane name="route" style={{ zIndex: 420 }} />
      {showCycleways && cycleways && <CyclewayLayer data={cycleways} />}
      {route && <RouteLayer route={route} />}
      {showParking && parking && <ParkingLayer data={parking} />}

      {start && start.source !== 'gps' && (
        <Marker
          position={[start.lat, start.lon]}
          icon={startIcon}
          draggable={!navigating}
          title="Polazište (povucite za promjenu)"
          eventHandlers={{ dragend: (ev) => onPick('start', latLonOf(ev.target as L.Marker)) }}
        />
      )}
      {end && (
        <Marker
          position={[end.lat, end.lon]}
          icon={endIcon}
          draggable={!navigating}
          title="Odredište (povucite za promjenu)"
          eventHandlers={{ dragend: (ev) => onPick('end', latLonOf(ev.target as L.Marker)) }}
        />
      )}
      {user && (
        <>
          <Circle
            center={[user.lat, user.lon]}
            radius={user.accuracy}
            pathOptions={{ color: '#2563eb', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12 }}
            interactive={false}
          />
          <Marker position={[user.lat, user.lon]} icon={userIcon(user.heading)} zIndexOffset={1000} interactive={false} />
        </>
      )}

      <ClickMenu disabled={navigating} onPick={onPick} />
      <FitRoute route={route} navigating={navigating} />
      <FollowUser user={user} active={navigating} recenterKey={recenterKey} />
      <FocusOnUser user={user} navigating={navigating} />
      <ZoomButtons />
    </MapContainer>
  );
}

function latLonOf(marker: L.Marker): LatLon {
  const p = marker.getLatLng();
  return { lat: p.lat, lon: p.lng };
}

function ZoomButtons() {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  return (
    <div ref={ref} className="map-zoom" role="group" aria-label="Zumiranje karte">
      <button type="button" className="icon-btn" aria-label="Povećaj" onClick={() => map.zoomIn()}>
        +
      </button>
      <button type="button" className="icon-btn" aria-label="Smanji" onClick={() => map.zoomOut()}>
        −
      </button>
    </div>
  );
}
