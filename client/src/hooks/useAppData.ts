import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../services/api';
import type { CyclewayCollection, HealthStatus, ParkingCollection, PublicConfig } from '../types';

export const DEFAULT_CONFIG: PublicConfig = {
  averageSpeedKmh: 15,
  mapCenter: { lat: 45.8131, lon: 15.9775 },
  bbox: [15.82, 45.7, 16.25, 45.93],
  navigation: {
    offRouteThresholdM: 35,
    offRouteConfirmations: 3,
    offRouteMinDurationMs: 4000,
    maxAcceptableAccuracyM: 50,
    arrivalRadiusM: 25,
    rerouteCooldownMs: 10000,
  },
};

interface LayerData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Konfiguracija, stanje poslužitelja i slojevi infrastrukture (s ponovnim pokušajem). */
export function useAppData() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [cycleways, setCycleways] = useState<LayerData<CyclewayCollection>>({ data: null, error: null, loading: true });
  const [parking, setParking] = useState<LayerData<ParkingCollection>>({ data: null, error: null, loading: true });

  const loadLayers = useCallback(async () => {
    setCycleways((s) => ({ ...s, loading: true }));
    setParking((s) => ({ ...s, loading: true }));
    const [c, p] = await Promise.allSettled([api.cycleways(), api.parking()]);
    setCycleways(
      c.status === 'fulfilled'
        ? { data: c.value, error: null, loading: false }
        : { data: null, error: (c.reason as ApiError).message, loading: false },
    );
    setParking(
      p.status === 'fulfilled'
        ? { data: p.value, error: null, loading: false }
        : { data: null, error: (p.reason as ApiError).message, loading: false },
    );
  }, []);

  useEffect(() => {
    api.config().then(setConfig).catch(() => undefined);
    void loadLayers();
  }, [loadLayers]);

  // Stanje routing enginea: često dok se priprema, rijetko kad je spreman.
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const poll = async () => {
      let next = 30_000;
      try {
        const h = await api.health();
        if (cancelled) return;
        setHealth(h);
        if (h.routing.state !== 'ready') next = 4_000;
      } catch {
        if (cancelled) return;
        setHealth(null);
        next = 5_000;
      }
      timer = window.setTimeout(poll, next);
    };
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Ako slojevi nisu stigli (npr. portal nedostupan pri prvom pokretanju), ponovni pokušaj.
  useEffect(() => {
    if (cycleways.loading || parking.loading) return;
    if (!cycleways.error && !parking.error) return;
    const t = window.setTimeout(() => void loadLayers(), 20_000);
    return () => window.clearTimeout(t);
  }, [cycleways, parking, loadLayers]);

  const refresh = useCallback(async () => {
    await api.refreshInfrastructure();
    await loadLayers();
  }, [loadLayers]);

  return { config, health, cycleways, parking, refresh };
}
