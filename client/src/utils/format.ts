export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '–';
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace('.', ',')} km`;
  if (m >= 100) return `${Math.round(m / 10) * 10} m`;
  return `${Math.max(0, Math.round(m))} m`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '–';
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export const formatPercent = (share: number): string => `${Math.round(share * 100)} %`;

export function formatArrival(secondsFromNow: number, now = new Date()): string {
  const t = new Date(now.getTime() + secondsFromNow * 1000);
  return t.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
}
