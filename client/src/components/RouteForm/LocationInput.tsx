import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../../services/api';
import type { GeocodeResult, Place } from '../../types';
import { Icon } from '../common/Icon';

interface Props {
  label: string;
  marker: 'start' | 'end';
  value: Place | null;
  placeholder: string;
  onSelect: (place: Place | null) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}

/** Polje za unos adrese s geokodiranjem (prijedlozi dok korisnik tipka). */
export function LocationInput({ label, marker, value, placeholder, onSelect, onError, disabled, trailing }: Props) {
  const [text, setText] = useState(value?.label ?? '');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const listId = useId();
  const typed = useRef(false);

  useEffect(() => {
    setText(value?.label ?? '');
    typed.current = false;
  }, [value]);

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 3) {
      setResults([]);
      setNotFound(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await api.geocode(q, ctrl.signal);
        setResults(found);
        setNotFound(false);
        setOpen(true);
        setActive(found.length ? 0 : -1);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setResults([]);
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else onError((err as Error).message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [text, onError]);

  const choose = (r: GeocodeResult) => {
    onSelect({ lat: r.lat, lon: r.lon, label: r.label + (r.detail ? `, ${r.detail.split(',')[0]}` : ''), source: 'search' });
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="location-input">
      <label className="location-input__label">
        <span className={`dot dot--${marker}`} aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            typed.current = true;
            setText(e.target.value);
          }}
          onFocus={(e) => {
            e.target.select();
            if (results.length) setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
        />
        {searching && <span className="spinner spinner--small" aria-label="Pretraživanje" />}
        {value && !disabled && (
          <button
            type="button"
            className="icon-btn icon-btn--ghost"
            aria-label={`Očisti ${label.toLowerCase()}`}
            onClick={() => {
              onSelect(null);
              setText('');
            }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
        {trailing}
      </label>
      {notFound && typed.current && <p className="field-hint field-hint--warn">Lokacija nije pronađena na području Zagreba.</p>}
      {open && results.length > 0 && (
        <ul className="suggestions" id={listId} role="listbox">
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lon},${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
            >
              <strong>{r.label}</strong>
              {r.detail && <span>{r.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
