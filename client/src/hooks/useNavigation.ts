import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { LatLon, PublicConfig, RouteMode, RouteResult } from '../types';
import { GEO_OPTIONS, geolocationErrorMessage, geolocationSupportError } from '../utils/geolocation';
import { NavigationTracker, type NavSnapshot } from '../utils/navigationTracker';
import { toPosition, type Position } from './useCurrentLocation';

interface Options {
  config: PublicConfig;
  onRouteChange: (route: RouteResult) => void;
  notify: (kind: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

export interface NavigationState {
  active: boolean;
  position: Position | null;
  snapshot: NavSnapshot | null;
  rerouting: boolean;
  gpsError: string | null;
}

const INITIAL: NavigationState = { active: false, position: null, snapshot: null, rerouting: false, gpsError: null };

/**
 * GPS navigacija: watchPosition(), praćenje napretka, detekcija odstupanja
 * i automatsko preračunavanje rute. Backend se poziva samo za novu rutu.
 */
export function useNavigation({ config, onRouteChange, notify }: Options) {
  const [state, setState] = useState<NavigationState>(INITIAL);
  const watchId = useRef<number | null>(null);
  const tracker = useRef<NavigationTracker | null>(null);
  const target = useRef<{ end: LatLon; mode: RouteMode } | null>(null);
  const rerouting = useRef(false);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const callbacks = useRef({ onRouteChange, notify });
  callbacks.current = { onRouteChange, notify };

  const clearWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation?.clearWatch(watchId.current);
      watchId.current = null;
    }
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }, []);

  const stop = useCallback(() => {
    clearWatch();
    tracker.current = null;
    target.current = null;
    rerouting.current = false;
    setState(INITIAL);
  }, [clearWatch]);

  const reroute = useCallback(async (pos: Position) => {
    if (!target.current || !tracker.current || rerouting.current) return;
    rerouting.current = true;
    tracker.current.markRerouteRequested(pos.timestamp);
    setState((s) => ({ ...s, rerouting: true }));
    callbacks.current.notify('warning', 'Skrenuli ste s rute – izračunavam novu rutu…');
    try {
      const route = await api.recalculate({ lat: pos.lat, lon: pos.lon }, target.current.end, target.current.mode);
      if (!tracker.current) return; // navigacija je u međuvremenu završena
      tracker.current.setRoute(route);
      callbacks.current.onRouteChange(route);
      callbacks.current.notify('success', 'Nova ruta je izračunata.');
    } catch (err) {
      callbacks.current.notify('error', `Preračunavanje rute nije uspjelo: ${(err as Error).message}`);
    } finally {
      rerouting.current = false;
      setState((s) => ({ ...s, rerouting: false }));
    }
  }, []);

  const handlePosition = useCallback(
    (raw: GeolocationPosition) => {
      const pos = toPosition(raw);
      const t = tracker.current;
      if (!t) return;
      const snapshot = t.update({ lat: pos.lat, lon: pos.lon, accuracy: pos.accuracy, timestamp: pos.timestamp });
      setState((s) => ({ ...s, position: pos, snapshot, gpsError: null }));
      if (snapshot.status === 'arrived') {
        callbacks.current.notify('success', 'Stigli ste na odredište!');
        clearWatch();
        setState((s) => ({ ...s, active: false }));
        return;
      }
      if (snapshot.shouldReroute) void reroute(pos);
    },
    [clearWatch, reroute],
  );

  const start = useCallback(
    (route: RouteResult, end: LatLon, mode: RouteMode) => {
      const unsupported = geolocationSupportError();
      if (unsupported) {
        callbacks.current.notify('error', unsupported);
        return;
      }
      clearWatch();
      tracker.current = new NavigationTracker(route, config.navigation);
      target.current = { end, mode };
      setState({ ...INITIAL, active: true });
      watchId.current = navigator.geolocation.watchPosition(
        handlePosition,
        (err) => {
          const message = geolocationErrorMessage(err);
          if (err.code === 1) {
            callbacks.current.notify('error', message);
            stop();
            return;
          }
          // Signal nedostupan / timeout: praćenje se nastavlja, korisnik je obaviješten.
          setState((s) => ({ ...s, gpsError: message }));
        },
        GEO_OPTIONS,
      );
      // Zaslon ostaje upaljen tijekom vožnje (ako preglednik to podržava).
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      nav.wakeLock
        ?.request('screen')
        .then((lock) => (wakeLock.current = lock))
        .catch(() => undefined);
    },
    [clearWatch, config.navigation, handlePosition, stop],
  );

  /** Kad korisnik ručno promijeni rutu tijekom navigacije. */
  const replaceRoute = useCallback((route: RouteResult) => {
    tracker.current?.setRoute(route);
  }, []);

  useEffect(() => clearWatch, [clearWatch]); // čišćenje watcha pri unmountu

  return { state, start, stop, replaceRoute };
}
