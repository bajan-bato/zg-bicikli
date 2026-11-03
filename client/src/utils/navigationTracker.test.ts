import { navConfig, pt, testRoute } from '../test/fixtures';
import { NavigationTracker } from './navigationTracker';

const fix = (x: number, y: number, t: number, accuracy = 8) => {
  const [lon, lat] = pt(x, y);
  return { lon, lat, accuracy, timestamp: t };
};

describe('NavigationTracker', () => {
  it('računa preostalu udaljenost, vrijeme i sljedeće skretanje', () => {
    const tr = new NavigationTracker(testRoute(), navConfig);
    const s = tr.update(fix(300, 3, 0));
    expect(s.status).toBe('navigating');
    expect(s.alongM).toBeGreaterThan(295);
    expect(s.alongM).toBeLessThan(305);
    expect(s.remainingM).toBeCloseTo(1250, -1);
    expect(s.remainingS).toBeCloseTo(1250 / (15 / 3.6), -1);
    expect(s.nextInstruction?.text).toBe('Skrenite lijevo – Ilica');
    expect(s.distanceToNextM).toBeCloseTo(200, -1);
  });

  it('zbraja prijeđenu udaljenost i filtrira podrhtavanje', () => {
    const tr = new NavigationTracker(testRoute(), navConfig);
    tr.update(fix(0, 0, 0));
    tr.update(fix(1, 0, 1000)); // 1 m – podrhtavanje
    tr.update(fix(100, 0, 2000));
    const s = tr.update(fix(200, 0, 3000));
    expect(s.traveledM).toBeCloseTo(200, -1);
  });

  it('traži preračunavanje tek nakon potvrđenog odstupanja i poštuje cooldown', () => {
    const tr = new NavigationTracker(testRoute(), navConfig);
    expect(tr.update(fix(300, 0, 0)).shouldReroute).toBe(false);
    expect(tr.update(fix(300, 120, 1000)).shouldReroute).toBe(false);
    expect(tr.update(fix(300, 130, 3000)).shouldReroute).toBe(false);
    const confirmed = tr.update(fix(300, 140, 5500));
    expect(confirmed.status).toBe('off-route');
    expect(confirmed.shouldReroute).toBe(true);
    tr.markRerouteRequested(5500);
    expect(tr.update(fix(300, 150, 7000)).shouldReroute).toBe(false); // cooldown 10 s
    expect(tr.update(fix(300, 160, 16000)).shouldReroute).toBe(true);
  });

  it('nova ruta nakon preračunavanja resetira detekciju i zadržava prijeđeno', () => {
    const tr = new NavigationTracker(testRoute(), navConfig);
    tr.update(fix(0, 0, 0));
    tr.update(fix(300, 0, 1000));
    const before = tr.update(fix(300, 150, 2000)).traveledM;
    tr.setRoute(testRoute({ id: 'r2', geometry: { type: 'LineString', coordinates: [pt(300, 150), pt(1550, 150), pt(1550)] } }));
    const s = tr.update(fix(400, 150, 3000));
    expect(s.status).toBe('navigating');
    expect(s.deviation).toBe('on-route');
    expect(s.traveledM).toBeGreaterThan(before);
  });

  it('slaba preciznost se prijavljuje i ne uzrokuje preračunavanje', () => {
    const tr = new NavigationTracker(testRoute(), navConfig);
    const s = tr.update(fix(300, 300, 0, 150));
    expect(s.status).toBe('weak-signal');
    expect(s.shouldReroute).toBe(false);
  });

  it('prepoznaje dolazak na odredište', () => {
    const tr = new NavigationTracker(testRoute(), navConfig);
    const s = tr.update(fix(1540, 2, 0));
    expect(s.status).toBe('arrived');
    expect(s.remainingM).toBe(0);
    expect(s.nextInstruction).toBeNull();
  });
});
