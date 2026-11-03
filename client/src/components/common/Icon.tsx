import type { TurnModifier } from '../../types';

const PATHS = {
  bike: 'M5.5 17.5a3.5 3.5 0 1 0 0-.01M18.5 17.5a3.5 3.5 0 1 0 0-.01M5.5 17.5l4-7h5.5l3.5 7M9.5 10.5l3.5 7M14 7h3',
  locate: 'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
  swap: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
  close: 'M6 6l12 12M18 6L6 18',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  navigation: 'M3 11l18-8-8 18-2-8-8-2z',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
  route: 'M6 19a2 2 0 1 0 0-.01M18 5a2 2 0 1 0 0-.01M6 17V9a4 4 0 0 1 4-4h2M18 7v8a4 4 0 0 1-4 4h-2',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  gps: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2',
  parking: 'M7 21V3h6a5 5 0 0 1 0 10H7',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'M5 12l5 5L20 7',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

const ROTATION: Record<TurnModifier, number> = {
  straight: 0,
  'slight-right': 45,
  right: 90,
  'sharp-right': 135,
  uturn: 180,
  'sharp-left': -135,
  left: -90,
  'slight-left': -45,
};

/** Strelica smjera za navigacijske upute. */
export function TurnArrow({ modifier, type, size = 28 }: { modifier: TurnModifier | null; type: string; size?: number }) {
  if (type === 'arrive') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={PATHS.flag} />
      </svg>
    );
  }
  const deg = modifier ? ROTATION[modifier] : 0;
  const d =
    modifier === 'uturn'
      ? 'M8 20V9a4 4 0 0 1 8 0v6M13 12l3 3 3-3'
      : deg === 0
        ? 'M12 20V4M6 10l6-6 6 6'
        : 'M12 21v-7a4 4 0 0 1 4-4h4M16 6l4 4-4 4';
  const flip = deg < 0 ? 'scale(-1,1) translate(-24,0)' : undefined;
  const tilt = Math.abs(deg) === 45 ? 'rotate(-30 12 14)' : Math.abs(deg) === 135 ? 'rotate(35 12 14)' : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform={[flip, tilt].filter(Boolean).join(' ') || undefined}>
        <path d={d} />
      </g>
    </svg>
  );
}
