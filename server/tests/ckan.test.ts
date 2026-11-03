import { describe, expect, it, vi } from 'vitest';
import { CkanClient, isGeoJsonResource, type CkanPackage } from '../src/services/ckan/ckanClient.js';
import { discoverDataset } from '../src/services/ckan/datasetDiscovery.js';
import { cyclewaySpec, parkingSpec } from '../src/services/infrastructure/datasetSpecs.js';
import { ErrorCodes } from '../src/utils/errors.js';
import { HttpError } from '../src/utils/http.js';

const cyclewayGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'MultiLineString', coordinates: [[[15.97, 45.8], [15.98, 45.8]]] },
      properties: {
        OBJECTID: 1,
        kategorija_id: 'PB',
        lokacija: 'Ulica Vjekoslava Heinzela - zapad',
        zavrsni_sloj: 'asfalt',
        duljina: 325,
        MJESNI_ODBOR: '"Eugen Kvaternik"',
        GRADSKA_CETVRT: 'MAKSIMIR',
        SHAPE_Length: 0.0034,
      },
    },
  ],
};

const pkg = (over: Partial<CkanPackage>): CkanPackage => ({
  id: 'id-1',
  name: 'geoportal-biciklisticke-staze',
  title: 'Geoportal biciklističke staze',
  license_title: 'Otvorena dozvola',
  organization: { title: 'Grad Zagreb' },
  resources: [
    { id: 'csv-1', name: 'CSV', format: 'CSV', url: 'https://example.test/staze.csv' },
    { id: 'geo-1', name: 'GeoJSON', format: 'GeoJSON', url: 'https://example.test/staze.geojson' },
  ],
  ...over,
});

/** Lažni HTTP sloj koji oponaša CKAN Action API i preuzimanje resursa. */
function fakeHttp(routes: Record<string, unknown | Error>) {
  return vi.fn(async (url: string) => {
    const match = Object.entries(routes).find(([prefix]) => url.includes(prefix));
    if (!match) throw new HttpError(url, 404, `nema ${url}`);
    if (match[1] instanceof Error) throw match[1];
    return match[1];
  }) as unknown as <T>(url: string) => Promise<T>;
}

describe('CKAN klijent', () => {
  it('poziva package_search i vraća rezultate', async () => {
    const http = fakeHttp({ package_search: { success: true, result: { count: 1, results: [pkg({})] } } });
    const client = new CkanClient('https://ckan.test/api/3/action', http);
    const results = await client.packageSearch('biciklističke staze');
    expect(results).toHaveLength(1);
    expect((http as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('package_search?q=biciklisti%C4%8Dke+staze');
  });

  it('prepoznaje GeoJSON resurse po formatu ili URL-u', () => {
    expect(isGeoJsonResource({ id: '1', name: null, format: 'GeoJSON', url: 'x' })).toBe(true);
    expect(isGeoJsonResource({ id: '2', name: null, format: 'geo json', url: 'x' })).toBe(true);
    expect(isGeoJsonResource({ id: '3', name: null, format: '', url: 'https://a/downloads/data?format=geojson&x=1' })).toBe(true);
    expect(isGeoJsonResource({ id: '4', name: null, format: 'CSV', url: 'https://a/data.csv' })).toBe(false);
  });

  it('pretvara mrežnu grešku u CKAN_UNAVAILABLE', async () => {
    const http = fakeHttp({ package_search: new HttpError('u', null, 'isteklo vrijeme') });
    const client = new CkanClient('https://ckan.test', http);
    await expect(client.packageSearch('x')).rejects.toMatchObject({ code: ErrorCodes.CKAN_UNAVAILABLE, status: 502 });
  });

  it('odbija odgovor sa success=false', async () => {
    const http = fakeHttp({ package_search: { success: false, error: { message: 'Search error' } } });
    await expect(new CkanClient('https://ckan.test', http).packageSearch('x')).rejects.toMatchObject({
      code: ErrorCodes.CKAN_UNAVAILABLE,
    });
  });
});

describe('Otkrivanje skupa podataka', () => {
  it('pronalazi skup, odabire GeoJSON resurs i bilježi izvor', async () => {
    const http = fakeHttp({
      package_search: {
        success: true,
        result: {
          count: 2,
          results: [
            pkg({ id: 'other', name: 'projekti-opcine', title: 'Izgradnja biciklističke infrastrukture', resources: [] }),
            pkg({}),
          ],
        },
      },
      'staze.geojson': cyclewayGeoJson,
    });
    const result = await discoverDataset(new CkanClient('https://ckan.test', http), cyclewaySpec);
    expect(result.source).toMatchObject({
      datasetName: 'geoportal-biciklisticke-staze',
      resourceId: 'geo-1',
      organization: 'Grad Zagreb',
      featureCount: 1,
    });
    expect(result.data.features[0].properties.MJESNI_ODBOR).toBe('Eugen Kvaternik');
  });

  it('javlja CKAN_RESOURCE_NOT_FOUND kad nema GeoJSON resursa', async () => {
    const http = fakeHttp({
      package_search: { success: true, result: { count: 1, results: [pkg({ resources: [{ id: 'c', name: 'CSV', format: 'CSV', url: 'x.csv' }] })] } },
    });
    await expect(discoverDataset(new CkanClient('https://ckan.test', http), cyclewaySpec)).rejects.toMatchObject({
      code: ErrorCodes.CKAN_RESOURCE_NOT_FOUND,
    });
  });

  it('javlja INVALID_GEOJSON kad resurs nema očekivanu strukturu', async () => {
    const http = fakeHttp({
      package_search: { success: true, result: { count: 1, results: [pkg({ name: 'parkiralista', title: 'Geoportal Javna parkirališta za bicikle' })] } },
      'staze.geojson': cyclewayGeoJson, // staze umjesto parkirališta → kriva struktura
    });
    await expect(discoverDataset(new CkanClient('https://ckan.test', http), parkingSpec)).rejects.toMatchObject({
      code: ErrorCodes.INVALID_GEOJSON,
    });
  });

  it('propagira nedostupnost CKAN-a', async () => {
    const http = fakeHttp({ package_search: new HttpError('u', 503, 'HTTP 503') });
    await expect(discoverDataset(new CkanClient('https://ckan.test', http), cyclewaySpec)).rejects.toMatchObject({
      code: ErrorCodes.CKAN_UNAVAILABLE,
    });
  });
});
