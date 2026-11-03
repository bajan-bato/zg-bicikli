import { DeviationDetector } from './deviation';

const opts = { thresholdM: 35, confirmations: 3, minDurationMs: 4000, maxAccuracyM: 50 };

describe('DeviationDetector', () => {
  it('na ruti ostaje "on-route"', () => {
    const d = new DeviationDetector(opts);
    expect(d.update({ distanceM: 10, accuracyM: 8, timestamp: 0 })).toBe('on-route');
  });

  it('jedno mjerenje izvan rute nije dovoljno (GPS skok)', () => {
    const d = new DeviationDetector(opts);
    expect(d.update({ distanceM: 120, accuracyM: 8, timestamp: 0 })).toBe('suspect');
    expect(d.update({ distanceM: 5, accuracyM: 8, timestamp: 1000 })).toBe('on-route');
  });

  it('potvrđuje odstupanje nakon N uzastopnih mjerenja i minimalnog trajanja', () => {
    const d = new DeviationDetector(opts);
    expect(d.update({ distanceM: 80, accuracyM: 8, timestamp: 0 })).toBe('suspect');
    expect(d.update({ distanceM: 85, accuracyM: 8, timestamp: 1000 })).toBe('suspect');
    // 3 mjerenja, ali tek 2 s – još nije potvrđeno
    expect(d.update({ distanceM: 90, accuracyM: 8, timestamp: 2000 })).toBe('suspect');
    expect(d.update({ distanceM: 95, accuracyM: 8, timestamp: 4500 })).toBe('off-route');
  });

  it('ignorira mjerenja loše preciznosti', () => {
    const d = new DeviationDetector(opts);
    expect(d.update({ distanceM: 200, accuracyM: 120, timestamp: 0 })).toBe('uncertain');
    expect(d.update({ distanceM: 200, accuracyM: 120, timestamp: 9000 })).toBe('uncertain');
  });

  it('prag raste s GPS nepreciznošću', () => {
    const d = new DeviationDetector(opts);
    // 50 m od rute uz ±40 m: prag = 35 + 20 = 55 → još na ruti
    expect(d.update({ distanceM: 50, accuracyM: 40, timestamp: 0 })).toBe('on-route');
    expect(d.update({ distanceM: 50, accuracyM: 5, timestamp: 0 })).toBe('suspect');
  });
});
