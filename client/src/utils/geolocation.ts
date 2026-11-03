/** Poruke za greške Geolocation API-ja na hrvatskom. */
export function geolocationErrorMessage(error: GeolocationPositionError | { code: number }): string {
  switch (error.code) {
    case 1:
      return 'Pristup lokaciji je odbijen. Dopustite pristup lokaciji u postavkama preglednika kako biste koristili GPS.';
    case 2:
      return 'GPS signal trenutno nije dostupan. Provjerite je li uključena lokacija na uređaju.';
    case 3:
      return 'Dohvaćanje lokacije traje predugo – čeka se GPS signal.';
    default:
      return 'Lokaciju nije moguće dohvatiti.';
  }
}

export function geolocationSupportError(): string | null {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return 'Ovaj preglednik ne podržava određivanje lokacije.';
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Lokacija je dostupna samo preko sigurne veze (HTTPS). Otvorite aplikaciju preko HTTPS-a ili na localhostu.';
  }
  return null;
}

export const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 };
