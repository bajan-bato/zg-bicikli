export interface DeviationOptions {
  /** Osnovni prag udaljenosti od rute (m). */
  thresholdM: number;
  /** Broj uzastopnih mjerenja izvan rute potreban za potvrdu odstupanja. */
  confirmations: number;
  /** Najmanje trajanje odstupanja (ms) – sprječava reakciju na jedan "skok" GPS-a. */
  minDurationMs: number;
  /** Mjerenja lošije preciznosti se ne koriste za odluku. */
  maxAccuracyM: number;
}

export type DeviationState = 'on-route' | 'suspect' | 'off-route' | 'uncertain';

export interface DeviationSample {
  distanceM: number;
  accuracyM: number;
  timestamp: number;
}

/**
 * Detekcija odstupanja od rute s tolerancijom GPS pogreške:
 * - mjerenja s lošom preciznošću se ignoriraju,
 * - prag se povećava za polovicu prijavljene preciznosti,
 * - odstupanje se potvrđuje tek nakon N uzastopnih mjerenja i minimalnog trajanja.
 */
export class DeviationDetector {
  private count = 0;
  private firstOffAt: number | null = null;

  constructor(private readonly opts: DeviationOptions) {}

  effectiveThreshold(accuracyM: number): number {
    return this.opts.thresholdM + Math.max(0, accuracyM) / 2;
  }

  update(sample: DeviationSample): DeviationState {
    if (!Number.isFinite(sample.accuracyM) || sample.accuracyM > this.opts.maxAccuracyM) return 'uncertain';
    if (sample.distanceM <= this.effectiveThreshold(sample.accuracyM)) {
      this.reset();
      return 'on-route';
    }
    this.count++;
    this.firstOffAt ??= sample.timestamp;
    const longEnough = sample.timestamp - this.firstOffAt >= this.opts.minDurationMs;
    return this.count >= this.opts.confirmations && longEnough ? 'off-route' : 'suspect';
  }

  reset(): void {
    this.count = 0;
    this.firstOffAt = null;
  }
}
