import { describe, expect, it } from 'vitest';
import { CyclewayIndex, lineCoverage } from '../src/services/routing/cyclewayIndex.js';
import { RoutingService } from '../src/services/routing/routingService.js';
import { at, cyclewayCollection, ladderNetwork, latLon, testRoutingConfig } from './helpers.js';

const opts = { toleranceM: 15, bearingToleranceDeg: 30, sampleSpacingM: 5 };
const flat = (pts: Array<[number, number]>) => pts.flatMap(([x, y]) => at(x, y));

describe('Duljina biciklističkih staza na ruti (prostorno preklapanje)', () => {
  it('računa samo stvarno preklapanje, ne cijelu duljinu staze', () => {
    // Staza 0–2000 m, ruta prolazi samo 500–1000 m uz nju.
    const index = new CyclewayIndex(cyclewayCollection([[[0, 8], [2000, 8]]]), opts);
    const cov = lineCoverage(index, flat([[500, 0], [1000, 0]]));
    expect(cov.totalM).toBeCloseTo(500, 0);
    expect(cov.coveredM).toBeCloseTo(500, 0);
  });

  it('djelomično preklapanje daje točan interval', () => {
    const index = new CyclewayIndex(cyclewayCollection([[[300, 5], [700, 5]]]), opts);
    const cov = lineCoverage(index, flat([[0, 0], [1000, 0]]));
    expect(cov.coveredM).toBeGreaterThan(395);
    expect(cov.coveredM).toBeLessThan(425); // tolerancija na krajevima staze
    expect(cov.intervals).toHaveLength(1);
    expect(cov.intervals[0][0]).toBeGreaterThan(280);
    expect(cov.intervals[0][1]).toBeLessThan(720);
  });

  it('ne broji staze koje su dalje od tolerancije', () => {
    const index = new CyclewayIndex(cyclewayCollection([[[0, 40], [1000, 40]]]), opts);
    expect(lineCoverage(index, flat([[0, 0], [1000, 0]])).coveredM).toBe(0);
  });

  it('ne broji okomite staze koje samo križaju rutu', () => {
    const index = new CyclewayIndex(cyclewayCollection([[[500, -300], [500, 300]]]), opts);
    expect(lineCoverage(index, flat([[0, 0], [1000, 0]])).coveredM).toBe(0);
  });

  it('više staza u blizini ne zbraja se dvostruko', () => {
    const index = new CyclewayIndex(
      cyclewayCollection([
        [[0, 5], [1000, 5]],
        [[0, -5], [1000, -5]],
      ]),
      opts,
    );
    expect(lineCoverage(index, flat([[0, 0], [1000, 0]])).coveredM).toBeCloseTo(1000, 0);
  });
});

describe('Statistika rute', () => {
  const s = new RoutingService(testRoutingConfig());
  s.setNetwork(ladderNetwork(), cyclewayCollection([[[0, 205], [1000, 205]]]));

  it('udio staza = duljina staza / ukupna duljina', () => {
    const r = s.route(latLon(0, 0), latLon(1000, 0), 'cycleways');
    expect(r.cyclewayShare).toBeCloseTo(r.cyclewayDistanceM / r.distanceM, 2);
    expect(r.cyclewayShare).toBeGreaterThan(0.65);
    expect(r.cyclewayShare).toBeLessThan(0.75);
    expect(r.cyclewayDistanceM + r.roadDistanceM).toBeCloseTo(r.distanceM, 0);
    expect(r.cyclewaySegments.length).toBeGreaterThan(0);
  });

  it('najkraća ruta bez staza ima udio 0', () => {
    const r = s.route(latLon(0, 0), latLon(1000, 0), 'shortest');
    expect(r.cyclewayDistanceM).toBe(0);
    expect(r.cyclewayShare).toBe(0);
    expect(r.roadDistanceM).toBeCloseTo(r.distanceM, 0);
  });

  it('trajanje se računa iz duljine i konfigurirane brzine', () => {
    const fast = new RoutingService(testRoutingConfig({ averageSpeedKmh: 20 }));
    fast.setNetwork(ladderNetwork(), null);
    const r = fast.route(latLon(0, 0), latLon(1000, 0), 'shortest');
    expect(r.durationS).toBeCloseTo(r.distanceM / (20 / 3.6), -1);
    expect(r.averageSpeedKmh).toBe(20);
  });
});
