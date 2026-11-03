export type * from '../../../shared/types/index';

import type { LatLon } from '../../../shared/types/index';

/** Odabrana točka (polazište ili odredište) s opisom za prikaz. */
export interface Place extends LatLon {
  label: string;
  source: 'search' | 'map' | 'gps';
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
