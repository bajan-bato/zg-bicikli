import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './components/common/Icon';
import { MapView } from './components/Map/MapView';
import { NavigationPanel } from './components/Navigation/NavigationPanel';
import { RouteForm } from './components/RouteForm/RouteForm';
import { RouteInfo } from './components/RouteInfo/RouteInfo';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { useAppData } from './hooks/useAppData';
import { useCurrentLocation, type Position } from './hooks/useCurrentLocation';
import { useNavigation } from './hooks/useNavigation';
import { api, ApiError } from './services/api';
import type { LatLon, Place, RouteMode, RouteResult, Toast } from './types';

let toastSeq = 0;

export default function App() {
  const { config, health, cycleways, parking, refresh } = useAppData();
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [mode, setMode] = useState<RouteMode>('cycleways');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showCycleways, setShowCycleways] = useState(true);
  const [showParking, setShowParking] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [located, setLocated] = useState<Position | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { locate, locating } = useCurrentLocation();

  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = ++toastSeq;
    setToasts((t) => [...t.filter((x) => x.message !== message), { id, kind, message }].slice(-4));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 5000);
  }, []);
  const notifyError = useCallback((message: string) => notify('error', message), [notify]);

  const navigation = useNavigation({ config, onRouteChange: setRoute, notify });
  const navigating = navigation.state.active || navigation.state.snapshot?.status === 'arrived';

  // Izračun rute čim su poznati polazište i odredište (ne tijekom navigacije).
  const routingReady = health?.routing.state === 'ready';
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (navigating) return;
    requestRef.current?.abort();
    if (!start || !end) {
      setRoute(null);
      setRouteError(null);
      return;
    }
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    const timer = window.setTimeout(async () => {
      setCalculating(true);
      setRouteError(null);
      try {
        const result = await api.route(start, end, mode, ctrl.signal);
        setRoute(result);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setRoute(null);
        setRouteError((err as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setCalculating(false);
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // routingReady: ponovni pokušaj kad routing engine postane spreman
  }, [start, end, mode, navigating, routingReady]);

  const placeFromPoint = useCallback(async (which: 'start' | 'end', p: LatLon) => {
    const setter = which === 'start' ? setStart : setEnd;
    const place: Place = { ...p, label: `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, source: 'map' };
    setter(place);
    try {
      const r = await api.reverse(p);
      if (r) setter((cur) => (cur && cur.lat === p.lat && cur.lon === p.lon ? { ...cur, label: r.label } : cur));
    } catch {
      /* naziv je samo kozmetika */
    }
  }, []);

  const useMyLocation = useCallback(async () => {
    try {
      const pos = await locate();
      setLocated(pos);
      setStart({ lat: pos.lat, lon: pos.lon, label: 'Moja lokacija', source: 'gps' });
      if (pos.accuracy > config.navigation.maxAcceptableAccuracyM) {
        notify('warning', `Lokacija je određena s preciznošću ±${Math.round(pos.accuracy)} m.`);
      }
    } catch (err) {
      notify('error', (err as Error).message);
    }
  }, [locate, notify, config.navigation.maxAcceptableAccuracyM]);

  const swap = useCallback(() => {
    setStart(end);
    setEnd(start);
  }, [start, end]);

  const startNavigation = () => {
    if (!route || !end) return;
    setSheetOpen(false);
    navigation.start(route, end, mode);
    setRecenterKey((k) => k + 1);
  };

  const stopNavigation = () => {
    navigation.stop();
    setSheetOpen(true);
  };

  const refreshData = async () => {
    try {
      await refresh();
      notify('success', 'Podaci s Portala otvorenih podataka su osvježeni.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Osvježavanje nije uspjelo.');
    }
  };

  const user = navigation.state.position ?? located;
  const dataError = cycleways.error ?? parking.error;

  return (
    <div className={`app${navigating ? ' is-navigating' : ''}`}>
      <TopBar
        health={health}
        showCycleways={showCycleways}
        showParking={showParking}
        onToggleCycleways={() => setShowCycleways((v) => !v)}
        onToggleParking={() => setShowParking((v) => !v)}
        onRefresh={refreshData}
      />
      <main className="workspace">
        {!navigating && (
          <aside className={`panel${sheetOpen ? '' : ' is-collapsed'}`} aria-label="Bočni panel">
            <button
              type="button"
              className="panel__handle"
              onClick={() => setSheetOpen((o) => !o)}
              aria-expanded={sheetOpen}
              aria-label={sheetOpen ? 'Skupi panel' : 'Proširi panel'}
            >
              <span />
            </button>
            <div className="panel__scroll">
              <RouteForm
                start={start}
                end={end}
                mode={mode}
                locating={locating}
                disabled={false}
                onStart={setStart}
                onEnd={setEnd}
                onSwap={swap}
                onMode={setMode}
                onMyLocation={useMyLocation}
                onError={notifyError}
              />

              {calculating && (
                <div className="panel-note">
                  <span className="spinner" /> Izračunavam rutu…
                </div>
              )}
              {!calculating && routeError && (
                <div className="panel-note panel-note--error" role="alert">
                  <Icon name="alert" size={18} />
                  <span>{routeError}</span>
                </div>
              )}
              {!calculating && route && <RouteInfo route={route} onNavigate={startNavigation} canNavigate={!!end} />}
              {!route && !calculating && !routeError && (
                <div className="empty-state">
                  <p>
                    Upišite adresu ili <strong>kliknite na kartu</strong> za odabir polazišta i odredišta.
                  </p>
                  <ul className="legend">
                    <li>
                      <span className="legend-line legend-line--cycleway" /> Biciklističke staze (Grad Zagreb)
                    </li>
                    <li>
                      <span className="legend-line legend-line--route" /> Izračunata ruta
                    </li>
                    <li>
                      <span className="legend-parking">P</span> Parkiralište za bicikle
                    </li>
                  </ul>
                  {health?.routing.state === 'loading' && (
                    <p className="field-hint">
                      <span className="spinner spinner--small" /> Routing engine priprema cestovnu mrežu Zagreba…
                    </p>
                  )}
                </div>
              )}
              {dataError && (
                <div className="panel-note panel-note--warn">
                  <Icon name="alert" size={18} />
                  <span>{dataError}</span>
                </div>
              )}
            </div>
          </aside>
        )}

        <div className="map-wrap">
          <MapView
            config={config}
            cycleways={cycleways.data}
            parking={parking.data}
            showCycleways={showCycleways}
            showParking={showParking}
            route={route}
            start={start}
            end={end}
            user={user}
            navigating={navigating}
            recenterKey={recenterKey}
            onPick={placeFromPoint}
          />
          {navigating && route && (
            <NavigationPanel nav={navigation.state} route={route} onStop={stopNavigation} onRecenter={() => setRecenterKey((k) => k + 1)} />
          )}
        </div>
      </main>
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}
