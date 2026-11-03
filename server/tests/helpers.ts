/**
 * Sintetički testni podaci. Koriste se ISKLJUČIVO u testovima kako bi rezultati
 * algoritama bili deterministični i provjerljivi; aplikacija koristi stvarne
 * podatke s data.gov.hr i OpenStreetMapa.
 */
import type { CyclewayCollection, LngLat } from '../../shared/types/index.js';
import type { RoutingConfig } from '../src/config/index.js';
import type { OsmNetwork, OsmWay } from '../src/services/routing/osmNetwork.js';

export const BASE_LON = 15.97;
export const BASE_LAT = 45.8;
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LON = 111_195 * Math.cos((45.81 * Math.PI) / 180);

/** Lokalne koordinate u metrima (x prema istoku, y prema sjeveru) → [lon, lat]. */
export const at = (x: number, y: number): LngLat => [BASE_LON + x / M_PER_DEG_LON, BASE_LAT + y / M_PER_DEG_LAT];
export const latLon = (x: number, y: number) => {
  const [lon, lat] = at(x, y);
  return { lat, lon };
};

export class NetworkBuilder {
  private nodes = new Map<string, number>();
  private coords: number[] = [];
  private ways: OsmWay[] = [];
  private nextId = 1;

  node(x: number, y: number): number {
    const key = `${x},${y}`;
    let id = this.nodes.get(key);
    if (!id) {
      id = this.nextId++;
      this.nodes.set(key, id);
      const [lon, lat] = at(x, y);
      this.coords.push(id, lon, lat);
    }
    return id;
  }

  way(points: Array<[number, number]>, tags: Record<string, string>): this {
    this.ways.push({ id: 1000 + this.ways.length, nodes: points.map(([x, y]) => this.node(x, y)), tags });
    return this;
  }

  build(): OsmNetwork {
    return { fetchedAt: new Date().toISOString(), osmTimestamp: 'test', bbox: [15.82, 45.7, 16.25, 45.93], nodes: this.coords, ways: this.ways };
  }
}

export function cyclewayCollection(lines: Array<Array<[number, number]>>): CyclewayCollection {
  return {
    type: 'FeatureCollection',
    features: lines.map((line, i) => ({
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: [line.map(([x, y]) => at(x, y))] },
      properties: {
        OBJECTID: i + 1,
        kategorija_id: 'PB',
        lokacija: `Staza ${i + 1}`,
        zavrsni_sloj: 'asfalt',
        duljina: 0,
        MJESNI_ODBOR: null,
        GRADSKA_CETVRT: null,
        SHAPE_Length: 0,
        geomLengthM: 0,
      },
    })),
  };
}

/**
 * Mreža "ljestve":
 *   C(0,200) ======= staza ======= D(1000,200)
 *     |                                  |
 *   A(0,0) ------- izravna cesta ------- B(1000,0)
 * plus izolirana cesta E–F (zasebna komponenta) i pješački prečac bez staze.
 */
export function ladderNetwork(): OsmNetwork {
  return new NetworkBuilder()
    .way([[0, 0], [500, 0], [1000, 0]], { highway: 'residential', name: 'Izravna ulica' })
    .way([[0, 0], [0, 200]], { highway: 'residential', name: 'Zapadna ulica' })
    .way([[0, 200], [500, 200], [1000, 200]], { highway: 'residential', name: 'Ulica sa stazom' })
    .way([[1000, 200], [1000, 0]], { highway: 'residential', name: 'Istočna ulica' })
    .way([[500, 0], [500, -150]], { highway: 'footway' })
    .way([[3000, 3000], [3400, 3000]], { highway: 'residential', name: 'Izolirana ulica' })
    .build();
}

/** Staza Grada Zagreba 5 m sjeverno od "Ulice sa stazom". */
export const ladderCycleways = (): CyclewayCollection => cyclewayCollection([[[0, 205], [1000, 205]]]);

export const testRoutingConfig = (over: Partial<RoutingConfig> = {}): RoutingConfig => ({
  averageSpeedKmh: 15,
  cyclewayMatchToleranceM: 15,
  cyclewayBearingToleranceDeg: 30,
  sampleSpacingM: 5,
  roadPenalty: 1.5,
  maxDetourFactor: 1.5,
  footwayCoverageThreshold: 0.6,
  snapMaxDistanceM: 400,
  minComponentSize: 1,
  routeCacheSize: 50,
  ...over,
});
