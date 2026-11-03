import { describe, expect, it } from 'vitest';
import { classifyWay, RoutingGraph, wayDirections } from '../src/services/routing/graph.js';
import { penaltySchedule, RoutingService } from '../src/services/routing/routingService.js';
import { ErrorCodes } from '../src/utils/errors.js';
import { ladderCycleways, ladderNetwork, latLon, NetworkBuilder, testRoutingConfig } from './helpers.js';

const service = (over = {}, withCycleways = true) => {
  const s = new RoutingService(testRoutingConfig(over));
  s.setNetwork(ladderNetwork(), withCycleways ? ladderCycleways() : null);
  return s;
};

const usesStreet = (route: ReturnType<RoutingService['route']>, name: string) =>
  route.instructions.some((i) => i.streetName === name);

describe('Pravila pristupa OSM putova', () => {
  it('klasificira prometnice za bicikle', () => {
    expect(classifyWay({ highway: 'residential' })).toBe('legal');
    expect(classifyWay({ highway: 'cycleway' })).toBe('legal');
    expect(classifyWay({ highway: 'footway' })).toBe('conditional');
    expect(classifyWay({ highway: 'footway', bicycle: 'designated' })).toBe('legal');
    expect(classifyWay({ highway: 'primary', bicycle: 'no' })).toBe('excluded');
    expect(classifyWay({ highway: 'service', access: 'private' })).toBe('excluded');
  });

  it('poštuje jednosmjerne ulice i iznimke za bicikle', () => {
    expect(wayDirections({ oneway: 'yes' })).toEqual({ forward: true, backward: false });
    expect(wayDirections({ oneway: 'yes', 'oneway:bicycle': 'no' })).toEqual({ forward: true, backward: true });
    expect(wayDirections({ oneway: '-1' })).toEqual({ forward: false, backward: true });
    expect(wayDirections({ junction: 'roundabout' })).toEqual({ forward: true, backward: false });
  });
});

describe('Najkraća ruta', () => {
  it('pronalazi rutu najmanje duljine po cestovnoj mreži', () => {
    const route = service().route(latLon(0, 0), latLon(1000, 0), 'shortest');
    expect(route.distanceM).toBeGreaterThan(990);
    expect(route.distanceM).toBeLessThan(1010);
    expect(usesStreet(route, 'Izravna ulica')).toBe(true);
    expect(route.penaltyUsed).toBe(0);
    expect(route.geometry.coordinates.length).toBeGreaterThan(2);
  });

  it('lijepi točke izvan mreže na najbliži brid', () => {
    const route = service().route(latLon(250, 30), latLon(750, -20), 'shortest');
    expect(route.distanceM).toBeCloseTo(500, -1);
  });

  it('ne vozi u suprotnom smjeru jednosmjerne ulice', () => {
    const net = new NetworkBuilder()
      .way([[0, 0], [1000, 0]], { highway: 'residential', oneway: 'yes', name: 'Jednosmjerna' })
      .way([[1000, 0], [1000, 300], [0, 300], [0, 0]], { highway: 'residential', name: 'Obilaznica' })
      .build();
    const s = new RoutingService(testRoutingConfig());
    s.setNetwork(net, null);
    const back = s.route(latLon(900, 0), latLon(100, 0), 'shortest');
    expect(back.distanceM).toBeGreaterThan(1500);
    const forward = s.route(latLon(100, 0), latLon(900, 0), 'shortest');
    expect(forward.distanceM).toBeCloseTo(800, -1);
  });
});

describe('Ruta s prioritetom biciklističkih staza', () => {
  it('bira dulju rutu koja koristi stazu', () => {
    const route = service().route(latLon(0, 0), latLon(1000, 0), 'cycleways');
    expect(usesStreet(route, 'Ulica sa stazom')).toBe(true);
    expect(route.distanceM).toBeCloseTo(1400, -1);
    expect(route.shortestDistanceM).toBeCloseTo(1000, -1);
    expect(route.cyclewayDistanceM).toBeGreaterThan(950);
    expect(route.penaltyUsed).toBe(1.5);
  });

  it('poštuje ograničenje duljine (kompromis duljina / udio staza)', () => {
    const route = service({ maxDetourFactor: 1.2 }).route(latLon(0, 0), latLon(1000, 0), 'cycleways');
    expect(route.distanceM).toBeLessThanOrEqual(1200);
    expect(usesStreet(route, 'Izravna ulica')).toBe(true);
  });

  it('podesivi penal mijenja izbor rute', () => {
    const s = service();
    const lowPenalty = s.route(latLon(0, 0), latLon(1000, 0), 'cycleways', { roadPenalty: 0.2 });
    expect(usesStreet(lowPenalty, 'Izravna ulica')).toBe(true);
  });

  it('koristi obične ceste za povezivanje kad staza ne pokriva cijelu rutu', () => {
    const route = service().route(latLon(0, 0), latLon(1000, 0), 'cycleways');
    expect(route.roadDistanceM).toBeGreaterThan(350);
    expect(usesStreet(route, 'Zapadna ulica')).toBe(true);
  });

  it('bez podataka o stazama vraća 503', () => {
    expect(() => service({}, false).route(latLon(0, 0), latLon(1000, 0), 'cycleways')).toThrowError(
      expect.objectContaining({ code: ErrorCodes.DATA_UNAVAILABLE }),
    );
  });

  it('raspored penala završava bez penala', () => {
    expect(penaltySchedule(1.6)).toEqual([1.6, 0.8, 0.4, 0.2]);
    expect(penaltySchedule(0)).toEqual([0]);
  });
});

describe('Pješačke površine i povezanost mreže', () => {
  it('pješačka staza bez potvrde iz podataka o stazama nije prohodna', () => {
    const graph = new RoutingGraph(ladderNetwork());
    graph.applyCycleways(null, 0.6);
    const footway = graph.edges.find((e) => e.highway === 'footway')!;
    expect(footway.usable).toBe(false);
  });

  it('javlja nepovezane točke', () => {
    expect(() => service().route(latLon(0, 0), latLon(3200, 3000), 'shortest')).toThrowError(
      expect.objectContaining({ code: ErrorCodes.NOT_CONNECTED, status: 422 }),
    );
  });

  it('javlja točku predaleko od mreže i izvan Zagreba', () => {
    expect(() => service().route(latLon(0, 0), latLon(1500, 1500), 'shortest')).toThrowError(
      expect.objectContaining({ code: ErrorCodes.ROUTE_NOT_FOUND }),
    );
    expect(() => service().route({ lat: 45.33, lon: 14.44 }, latLon(0, 0), 'shortest')).toThrowError(
      expect.objectContaining({ code: ErrorCodes.OUTSIDE_AREA }),
    );
  });

  it('routing engine koji nije spreman vraća 503', () => {
    const s = new RoutingService(testRoutingConfig());
    expect(() => s.route(latLon(0, 0), latLon(1000, 0), 'shortest')).toThrowError(
      expect.objectContaining({ code: ErrorCodes.ROUTING_UNAVAILABLE, status: 503 }),
    );
  });

  it('nedostupan izvor mreže ostavlja engine u stanju greške', async () => {
    const s = new RoutingService(testRoutingConfig());
    await s.initialize(async () => {
      throw new Error('Overpass nije dostupan');
    }, () => null);
    expect(s.health().state).toBe('error');
    expect(() => s.route(latLon(0, 0), latLon(1000, 0), 'shortest')).toThrowError(/Overpass nije dostupan/);
  });
});

describe('Upute', () => {
  it('generira hrvatske upute s dolaskom na odredište', () => {
    const route = service().route(latLon(0, 0), latLon(1000, 0), 'cycleways');
    const texts = route.instructions.map((i) => i.text);
    expect(texts[0]).toMatch(/^Krenite prema sjeveru/);
    expect(texts.some((t) => /Skrenite desno na biciklističku stazu – Ulica sa stazom/.test(t))).toBe(true);
    expect(texts.at(-1)).toBe('Stigli ste na odredište');
    const alongs = route.instructions.map((i) => i.alongM);
    expect([...alongs].sort((a, b) => a - b)).toEqual(alongs);
  });
});
