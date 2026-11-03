import { useCallback, useState } from 'react';
import { GEO_OPTIONS, geolocationErrorMessage, geolocationSupportError } from '../utils/geolocation';

export interface Position {
  lat: number;
  lon: number;
  accuracy: number;
  heading: number | null;
  timestamp: number;
}

export const toPosition = (p: GeolocationPosition): Position => ({
  lat: p.coords.latitude,
  lon: p.coords.longitude,
  accuracy: p.coords.accuracy,
  heading: p.coords.heading ?? null,
  timestamp: p.timestamp,
});

/** Jednokratno dohvaćanje lokacije za gumb "Moja lokacija" (traži dopuštenje preglednika). */
export function useCurrentLocation() {
  const [locating, setLocating] = useState(false);

  const locate = useCallback(
    () =>
      new Promise<Position>((resolve, reject) => {
        const unsupported = geolocationSupportError();
        if (unsupported) return reject(new Error(unsupported));
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setLocating(false);
            resolve(toPosition(p));
          },
          (err) => {
            setLocating(false);
            reject(new Error(geolocationErrorMessage(err)));
          },
          { ...GEO_OPTIONS, maximumAge: 10_000 },
        );
      }),
    [],
  );

  return { locate, locating };
}
