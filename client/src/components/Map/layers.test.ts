import L from 'leaflet';
import { createParkingMarkers, parkingPopupHtml } from '../ParkingMarkers/ParkingLayer';
import type { CyclewayCollection, ParkingCollection } from '../../types';
import { cyclewayPopupHtml } from './CyclewayLayer';
import { COLORS, cyclewayStyle, routeStyle } from './mapStyles';

const parking: ParkingCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [15.9695, 45.8063] },
      properties: {
        OBJECTID: 1,
        vrsta: 'stalci',
        naziv: 'Tehnički muzej',
        lokacija: 'Savska cesta 18',
        broj_stalaka: 10,
        broj_bicikala: 20,
        godina_postavljanja: 2014,
        MJESNI_ODBOR: 'Antun Mihanović',
        GRADSKA_CETVRT: 'TREŠNJEVKA - SJEVER',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [15.98, 45.81] },
      properties: {
        OBJECTID: 2,
        vrsta: null,
        naziv: '<script>alert(1)</script>',
        lokacija: null,
        broj_stalaka: null,
        broj_bicikala: null,
        godina_postavljanja: null,
        MJESNI_ODBOR: null,
        GRADSKA_CETVRT: null,
      },
    },
  ],
};

const cycleways: CyclewayCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: [[[15.97, 45.8], [15.98, 45.8]], [[15.98, 45.8], [15.98, 45.81]]] },
      properties: {
        OBJECTID: 1,
        kategorija_id: 'PB',
        lokacija: 'Ulica Vjekoslava Heinzela - zapad',
        zavrsni_sloj: 'asfalt',
        duljina: 325,
        MJESNI_ODBOR: 'Eugen Kvaternik',
        GRADSKA_CETVRT: 'MAKSIMIR',
        SHAPE_Length: 0.003,
        geomLengthM: 1890,
      },
    },
  ],
};

describe('Prikaz parkirališta', () => {
  it('stvara marker na stvarnim koordinatama za svako parkiralište', () => {
    const markers = createParkingMarkers(parking);
    expect(markers).toHaveLength(2);
    expect(markers[0].getLatLng()).toEqual(L.latLng(45.8063, 15.9695));
    expect(markers[0].options.title).toBe('Tehnički muzej');
  });

  it('informacijski prozor sadrži sva tražena polja', () => {
    const html = parkingPopupHtml(parking.features[0].properties, parking.features[0].geometry.coordinates);
    for (const text of ['Tehnički muzej', 'Savska cesta 18', 'stalci', 'Broj stalaka', '10', 'Kapacitet', '20', '2014', 'TREŠNJEVKA - SJEVER', 'Antun Mihanović']) {
      expect(html).toContain(text);
    }
  });

  it('nedostajuće vrijednosti prikazuje kao crticu i escapea HTML', () => {
    const html = parkingPopupHtml(parking.features[1].properties, parking.features[1].geometry.coordinates);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<dd>–</dd>');
  });
});

describe('Prikaz biciklističkih staza', () => {
  it('staze su deblja tirkizna linija, različita od ljubičaste rute', () => {
    const style = cyclewayStyle();
    expect(style.color).toBe(COLORS.cycleway);
    expect(style.weight).toBeGreaterThanOrEqual(5);
    expect(routeStyle.color).not.toBe(style.color);
    expect(cyclewayStyle(true).weight).toBeGreaterThan(style.weight!);
  });

  it('GeoJSON sloj sadrži sve linije stvarne geometrije', () => {
    const layer = L.geoJSON(cycleways as unknown as GeoJSON.GeoJsonObject, { style: () => cyclewayStyle() });
    const lines = layer.getLayers() as L.Polyline[];
    expect(lines).toHaveLength(1);
    const parts = lines[0].getLatLngs() as L.LatLng[][];
    expect(parts).toHaveLength(2);
    expect(parts[1][1]).toEqual(L.latLng(45.81, 15.98));
  });

  it('popup staze prikazuje lokaciju i duljinu iz geometrije', () => {
    const html = cyclewayPopupHtml(cycleways.features[0].properties);
    expect(html).toContain('Ulica Vjekoslava Heinzela - zapad');
    expect(html).toContain('1,9 km');
    expect(html).toContain('MAKSIMIR');
  });
});
