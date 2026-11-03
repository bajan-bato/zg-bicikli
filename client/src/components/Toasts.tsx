import type { Toast } from '../types';
import { Icon, type IconName } from './common/Icon';

const ICONS: Record<Toast['kind'], IconName> = { info: 'info', success: 'check', warning: 'alert', error: 'alert' };

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={ICONS[t.kind]} size={18} />
          <p>{t.message}</p>
          <button type="button" className="icon-btn icon-btn--ghost" aria-label="Zatvori obavijest" onClick={() => onDismiss(t.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
