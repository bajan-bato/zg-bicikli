import type { NavigationState } from '../../hooks/useNavigation';
import type { RouteResult } from '../../types';
import { formatArrival, formatDistance, formatDuration } from '../../utils/format';
import { Icon, TurnArrow } from '../common/Icon';

interface Props {
  nav: NavigationState;
  route: RouteResult;
  onStop: () => void;
  onRecenter: () => void;
}

/** Upute za aktivnu vožnju: sljedeće skretanje gore, statistika i "Završi" dolje. */
export function NavigationPanel({ nav, route, onStop, onRecenter }: Props) {
  const snap = nav.snapshot;
  const next = snap?.nextInstruction ?? null;
  const arrived = snap?.status === 'arrived';

  let status: { kind: 'ok' | 'warn' | 'error'; text: string } | null = null;
  if (nav.gpsError) status = { kind: 'error', text: nav.gpsError };
  else if (!nav.position) status = { kind: 'warn', text: 'Čekam GPS signal…' };
  else if (nav.rerouting) status = { kind: 'warn', text: 'Izračunavam novu rutu…' };
  else if (snap?.status === 'off-route') status = { kind: 'warn', text: 'Izvan rute' };
  else if (snap?.status === 'weak-signal')
    status = { kind: 'warn', text: `Slaba GPS preciznost (±${Math.round(nav.position.accuracy)} m)` };
  else if (snap?.deviation === 'suspect') status = { kind: 'warn', text: 'Provjeravam odstupanje od rute…' };
  else status = { kind: 'ok', text: `GPS ±${Math.round(nav.position.accuracy)} m` };

  return (
    <>
      <div className={`nav-banner${arrived ? ' nav-banner--arrived' : ''}`} role="status" aria-live="polite">
        {arrived ? (
          <>
            <span className="nav-banner__icon">
              <Icon name="flag" size={30} />
            </span>
            <div className="nav-banner__text">
              <strong>Stigli ste na odredište</strong>
              <span>Prijeđeno {formatDistance(snap?.traveledM ?? 0)}</span>
            </div>
          </>
        ) : next ? (
          <>
            <span className="nav-banner__icon">
              <TurnArrow modifier={next.modifier} type={next.type} size={34} />
            </span>
            <div className="nav-banner__text">
              <strong>{formatDistance(snap?.distanceToNextM ?? 0)}</strong>
              <span>{next.text.replace(/ i vozite .*$/, '')}</span>
            </div>
          </>
        ) : (
          <>
            <span className="nav-banner__icon">
              <Icon name="navigation" size={30} />
            </span>
            <div className="nav-banner__text">
              <strong>Navigacija</strong>
              <span>{route.instructions[0]?.text ?? 'Krenite'}</span>
            </div>
          </>
        )}
      </div>

      <div className="nav-footer">
        {status && (
          <p className={`gps-status gps-status--${status.kind}`}>
            <span className="gps-status__dot" aria-hidden="true" />
            {status.text}
          </p>
        )}
        <dl className="nav-stats">
          <div>
            <dt>Do cilja</dt>
            <dd>{formatDistance(snap?.remainingM ?? route.distanceM)}</dd>
          </div>
          <div>
            <dt>Preostalo</dt>
            <dd>{formatDuration(snap?.remainingS ?? route.durationS)}</dd>
          </div>
          <div>
            <dt>Dolazak</dt>
            <dd>{formatArrival(snap?.remainingS ?? route.durationS)}</dd>
          </div>
          <div>
            <dt>Prijeđeno</dt>
            <dd>{formatDistance(snap?.traveledM ?? 0)}</dd>
          </div>
        </dl>
        <div className="nav-actions">
          <button type="button" className="btn btn--ghost" onClick={onRecenter} aria-label="Centriraj na moju lokaciju">
            <Icon name="gps" size={18} /> Centriraj
          </button>
          <button type="button" className="btn btn--danger" onClick={onStop}>
            {arrived ? 'Zatvori' : 'Završi navigaciju'}
          </button>
        </div>
      </div>
    </>
  );
}
