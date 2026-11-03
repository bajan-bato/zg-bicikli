/**
 * Greška aplikacije s HTTP statusom, strojno čitljivim kodom i porukom na hrvatskom.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CKAN_UNAVAILABLE: 'CKAN_UNAVAILABLE',
  CKAN_RESOURCE_NOT_FOUND: 'CKAN_RESOURCE_NOT_FOUND',
  INVALID_GEOJSON: 'INVALID_GEOJSON',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  GEOCODING_FAILED: 'GEOCODING_FAILED',
  GEOCODING_UNAVAILABLE: 'GEOCODING_UNAVAILABLE',
  ROUTING_UNAVAILABLE: 'ROUTING_UNAVAILABLE',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  NOT_CONNECTED: 'POINTS_NOT_CONNECTED',
  OUTSIDE_AREA: 'OUTSIDE_AREA',
  OSM_UNAVAILABLE: 'OSM_UNAVAILABLE',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'Nepoznata greška';
