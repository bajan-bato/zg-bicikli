import type { Place, RouteMode } from '../../types';
import { Icon } from '../common/Icon';
import { LocationInput } from './LocationInput';

interface Props {
  start: Place | null;
  end: Place | null;
  mode: RouteMode;
  locating: boolean;
  disabled: boolean;
  onStart: (p: Place | null) => void;
  onEnd: (p: Place | null) => void;
  onSwap: () => void;
  onMode: (m: RouteMode) => void;
  onMyLocation: () => void;
  onError: (message: string) => void;
}

const MODES: Array<{ id: RouteMode; title: string; hint: string }> = [
  { id: 'shortest', title: 'Najkraća ruta', hint: 'Najmanja ukupna duljina' },
  { id: 'cycleways', title: 'Preferiraj biciklističke staze', hint: 'Što više staza uz razumnu duljinu' },
];

export function RouteForm(props: Props) {
  const { start, end, mode, locating, disabled, onStart, onEnd, onSwap, onMode, onMyLocation, onError } = props;
  return (
    <section className="route-form" aria-label="Planiranje rute">
      <div className="route-form__fields">
        <LocationInput
          label="Polazište"
          marker="start"
          value={start}
          placeholder="Polazište – adresa ili klik na kartu"
          onSelect={onStart}
          onError={onError}
          disabled={disabled}
          trailing={
            <button
              type="button"
              className="icon-btn icon-btn--accent"
              onClick={onMyLocation}
              disabled={disabled || locating}
              title="Moja lokacija"
              aria-label="Moja lokacija"
            >
              {locating ? <span className="spinner spinner--small" /> : <Icon name="locate" size={18} />}
            </button>
          }
        />
        <LocationInput
          label="Odredište"
          marker="end"
          value={end}
          placeholder="Odredište – adresa ili klik na kartu"
          onSelect={onEnd}
          onError={onError}
          disabled={disabled}
        />
        <button
          type="button"
          className="icon-btn swap-btn"
          onClick={onSwap}
          disabled={disabled || (!start && !end)}
          title="Zamijeni polazište i odredište"
          aria-label="Zamijeni polazište i odredište"
        >
          <Icon name="swap" size={18} />
        </button>
      </div>

      <div className="mode-toggle" role="radiogroup" aria-label="Vrsta rute">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={`mode-toggle__option${mode === m.id ? ' is-selected' : ''} mode-toggle__option--${m.id}`}
            onClick={() => onMode(m.id)}
            disabled={disabled}
          >
            <Icon name={m.id === 'shortest' ? 'route' : 'bike'} size={18} />
            <span>
              <strong>{m.title}</strong>
              <small>{m.hint}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
