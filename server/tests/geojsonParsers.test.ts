import { describe, expect, it } from 'vitest';
import { cleanText, parseCycleways, parseParking } from '../src/services/infrastructure/geojsonParsers.js';
import { ErrorCodes } from '../src/utils/errors.js';

const cycleway = (coords: unknown, type = 'MultiLineString', props: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type, coordinates: coords },
  properties: {
    OBJECTID: 7,
    kategorija_id: 'PB',
    lokacija: 'Savska cesta',
    zavrsni_sloj: 'asfalt',
    duljina: '100',
    MJESNI_ODBOR: '"Trnje"',
    GRADSKA_CETVRT: 'TRNJE',
    SHAPE_Length: 0.001,
    ...props,
  },
});

const parking = (coords: unknown, props: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coords },
  properties: {
    OBJECTID: 1,
    vrsta: 'stalci',
    naziv: 'Tehnički muzej',
    lokacija: 'Savska cesta 18',
    broj_stalaka: 10,
    broj_bicikala: 20,
    godina_postavljanja: 2014,
    MJESNI_ODBOR: '"Antun Mihanović"',
    GRADSKA_CETVRT: 'TREŠNJEVKA - SJEVER',
    ...props,
  },
});

describe('Parsiranje biciklističkih staza', () => {
  it('čuva geometriju i atribute te računa duljinu iz geometrije', () => {
    // ~100 m prema istoku
    const { data, skipped } = parseCycleways({
      type: 'FeatureCollection',
      features: [cycleway([[[15.97, 45.8], [15.97129, 45.8]]])],
    });
    expect(skipped).toBe(0);
    const f = data.features[0];
    expect(f.geometry.type).toBe('MultiLineString');
    expect(f.properties.lokacija).toBe('Savska cesta');
    expect(f.properties.MJESNI_ODBOR).toBe('Trnje');
    expect(f.properties.duljina).toBe(100);
    expect(f.properties.geomLengthM).toBeGreaterThan(95);
    expect(f.properties.geomLengthM).toBeLessThan(105);
  });

  it('prihvaća LineString i preskače objekte bez ispravne geometrije', () => {
    const { data, skipped } = parseCycleways({
      type: 'FeatureCollection',
      features: [
        cycleway([[15.97, 45.8], [15.98, 45.8]], 'LineString'),
        cycleway(null),
        cycleway([[[15.97, 45.8]]]),
      ],
    });
    expect(data.features).toHaveLength(1);
    expect(data.features[0].geometry.type).toBe('MultiLineString');
    expect(skipped).toBe(2);
  });

  it('odbija podatke koji nisu FeatureCollection', () => {
    expect(() => parseCycleways({ type: 'Feature' })).toThrowError(/FeatureCollection/);
    expect(() => parseCycleways('tekst')).toThrowError(/JSON objekt/);
    expect(() => parseCycleways({ type: 'FeatureCollection', features: [] })).toThrowError(/nijedan objekt/);
  });

  it('odbija podatke bez očekivanih svojstava', () => {
    try {
      parseCycleways({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { foo: 1 } }] });
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: ErrorCodes.INVALID_GEOJSON });
    }
  });

  it('odbija projicirane koordinate (nisu WGS84)', () => {
    expect(() =>
      parseCycleways({ type: 'FeatureCollection', features: [cycleway([[[458000, 5073000], [458100, 5073000]]])] }),
    ).toThrowError(/GeoJSON nije ispravan/);
  });
});

describe('Parsiranje parkirališta', () => {
  it('čuva koordinate i sva svojstva', () => {
    const { data } = parseParking({ type: 'FeatureCollection', features: [parking([15.9695, 45.8063])] });
    const f = data.features[0];
    expect(f.geometry.coordinates).toEqual([15.9695, 45.8063]);
    expect(f.properties).toMatchObject({
      naziv: 'Tehnički muzej',
      broj_stalaka: 10,
      broj_bicikala: 20,
      godina_postavljanja: 2014,
      MJESNI_ODBOR: 'Antun Mihanović',
    });
  });

  it('preskače točke bez koordinata', () => {
    const { data, skipped } = parseParking({
      type: 'FeatureCollection',
      features: [parking([15.97, 45.8]), parking(null), parking(['a', 'b'])],
    });
    expect(data.features).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe('cleanText', () => {
  it('uklanja navodnike i prazne vrijednosti', () => {
    expect(cleanText('"Eugen Kvaternik"')).toBe('Eugen Kvaternik');
    expect(cleanText('  ')).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});
