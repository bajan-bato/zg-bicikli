import { useState } from 'react';
import type { RouteResult } from '../../types';
import { formatDistance, formatDuration, formatPercent } from '../../utils/format';
import { Icon, TurnArrow } from '../common/Icon';

interface Props {
  route: RouteResult;
  onNavigate: () => void;
  canNavigate: boolean;
}

export function RouteInfo({ route, onNavigate, canNavigate }: Props) {
  const [showSteps, setShowSteps] = useState(false);
  const extra = route.distanceM - route.shortestDistanceM;
  const pct = Math.round(route.cyclewayShare * 100);

  return (
    <section className="route-info" aria-label="Rezultati rute" aria-live="polite">
      <header className="route-info__head">
        <div>
          <p className="eyebrow">{route.mode === 'cycleways' ? 'Ruta s prioritetom staza' : 'Najkraća ruta'}</p>
          <p className="route-info__main">
            <strong>{formatDuration(route.durationS)}</strong>
            <span>{formatDistance(route.distanceM)}</span>
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={onNavigate} disabled={!canNavigate}>
          <Icon name="navigation" size={18} /> Kreni
        </button>
      </header>

      <div className="share-bar" role="img" aria-label={`Biciklističke staze: ${pct} % rute`}>
        <span className="share-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <dl className="stats">
        <div className="stat stat--cycleway">
          <dt>Biciklističke staze</dt>
          <dd>
            {formatDistance(route.cyclewayDistanceM)} <small>{formatPercent(route.cyclewayShare)}</small>
          </dd>
        </div>
        <div className="stat">
          <dt>Obične ceste</dt>
          <dd>{formatDistance(route.roadDistanceM)}</dd>
        </div>
        <div className="stat">
          <dt>Prosječna brzina</dt>
          <dd>{route.averageSpeedKmh} km/h</dd>
        </div>
        <div className="stat">
          <dt>U odnosu na najkraću</dt>
          <dd>{extra > 5 ? `+${formatDistance(extra)}` : 'jednako'}</dd>
        </div>
      </dl>
      {route.mode === 'cycleways' && route.penaltyUsed === 0 && (
        <p className="field-hint">
          Zbog ograničenja duljine prikazana je najkraća ruta – obilazak radi staza bio bi predug.
        </p>
      )}

      <button type="button" className="link-btn" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps}>
        <Icon name={showSteps ? 'chevronUp' : 'chevronDown'} size={16} />
        {showSteps ? 'Sakrij upute' : `Prikaži upute (${route.instructions.length})`}
      </button>
      {showSteps && (
        <ol className="steps">
          {route.instructions.map((ins, i) => (
            <li key={i} className={ins.onCycleway ? 'is-cycleway' : undefined}>
              <span className="steps__icon">
                <TurnArrow modifier={ins.modifier} type={ins.type} size={20} />
              </span>
              <span className="steps__text">{ins.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
