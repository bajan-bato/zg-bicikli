import { useState } from 'react';
import type { HealthStatus } from '../types';
import { Icon } from './common/Icon';

interface Props {
  health: HealthStatus | null;
  showCycleways: boolean;
  showParking: boolean;
  onToggleCycleways: () => void;
  onToggleParking: () => void;
  onRefresh: () => Promise<void>;
}

function statusOf(health: HealthStatus | null): { kind: 'ok' | 'warn' | 'error'; text: string } {
  if (!health) return { kind: 'error', text: 'Poslužitelj nedostupan' };
  const r = health.routing;
  if (r.state === 'ready') return { kind: 'ok', text: 'Routing spreman' };
  if (r.state === 'error') return { kind: 'error', text: 'Routing nedostupan' };
  return { kind: 'warn', text: 'Priprema mreže…' };
}

export function TopBar({ health, showCycleways, showParking, onToggleCycleways, onToggleParking, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const status = statusOf(health);
  const source = health?.infrastructure.cycleways.source;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__logo" aria-hidden="true">
          <Icon name="bike" size={20} />
        </span>
        <span className="brand__name">
          Zagreb <b>Bike</b> <span className="brand__suffix">Navigator</span>
        </span>
      </div>

      <div className="topbar__controls">
        <button
          type="button"
          className={`toggle${showCycleways ? ' is-on' : ''}`}
          aria-pressed={showCycleways}
          onClick={onToggleCycleways}
          title="Prikaži/sakrij biciklističke staze"
        >
          <span className="legend-line legend-line--cycleway" aria-hidden="true" />
          <span className="toggle__label">Staze</span>
        </button>
        <button
          type="button"
          className={`toggle${showParking ? ' is-on' : ''}`}
          aria-pressed={showParking}
          onClick={onToggleParking}
          title="Prikaži/sakrij parkirališta za bicikle"
        >
          <span className="legend-parking" aria-hidden="true">
            P
          </span>
          <span className="toggle__label">Parkirališta</span>
        </button>
        <span
          className={`status-chip status-chip--${status.kind}`}
          title={health?.routing.message ?? (source ? `Podaci: ${source.datasetTitle} (${new Date(source.fetchedAt).toLocaleString('hr-HR')})` : '')}
        >
          <span className="status-chip__dot" aria-hidden="true" />
          <span className="status-chip__text">{status.text}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          title="Osvježi podatke s Portala otvorenih podataka"
          aria-label="Osvježi podatke s Portala otvorenih podataka"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              await onRefresh();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          {refreshing ? <span className="spinner spinner--small" /> : <Icon name="refresh" size={18} />}
        </button>
      </div>
    </header>
  );
}
