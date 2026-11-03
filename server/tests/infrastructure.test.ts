import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CkanClient } from '../src/services/ckan/ckanClient.js';
import { InfrastructureService } from '../src/services/infrastructure/infrastructureService.js';
import { ErrorCodes } from '../src/utils/errors.js';
import { FileCache } from '../src/utils/fileCache.js';
import { HttpError } from '../src/utils/http.js';

const geo = {
  cycleways: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: [[[15.97, 45.8], [15.98, 45.8]]] },
        properties: { OBJECTID: 1, kategorija_id: 'PB', lokacija: 'A', zavrsni_sloj: 'asfalt', duljina: 1, MJESNI_ODBOR: null, GRADSKA_CETVRT: null, SHAPE_Length: 1 },
      },
    ],
  },
  parking: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [15.97, 45.8] },
        properties: { OBJECTID: 1, vrsta: 'stalci', naziv: 'P', lokacija: 'L', broj_stalaka: 1, broj_bicikala: 2, godina_postavljanja: 2020, MJESNI_ODBOR: null, GRADSKA_CETVRT: null },
      },
    ],
  },
};

const packages = {
  success: true,
  result: {
    count: 2,
    results: [
      { id: 'a', name: 'geoportal-biciklisticke-staze', title: 'Geoportal biciklističke staze', resources: [{ id: 'r1', name: 'g', format: 'GeoJSON', url: 'https://x.test/staze' }] },
      { id: 'b', name: 'geoportal-javna-parkiralista-za-bicikle', title: 'Geoportal Javna parkirališta za bicikle', resources: [{ id: 'r2', name: 'g', format: 'GeoJSON', url: 'https://x.test/parking' }] },
    ],
  },
};

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zbn-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function service(online: { value: boolean }) {
  const http = vi.fn(async (url: string) => {
    if (!online.value) throw new HttpError(url, null, 'ECONNREFUSED');
    if (url.includes('package_search')) return packages;
    if (url.endsWith('/staze')) return geo.cycleways;
    if (url.endsWith('/parking')) return geo.parking;
    throw new HttpError(url, 404, '404');
  }) as unknown as <T>(url: string) => Promise<T>;
  return { svc: new InfrastructureService(new CkanClient('https://ckan.test', http), new FileCache(dir), 60_000), http };
}

describe('Dohvaćanje i predmemoriranje infrastrukture', () => {
  it('preuzima oba skupa i sprema ih na disk', async () => {
    const { svc } = service({ value: true });
    await svc.init();
    expect(svc.cycleways.get().data.features).toHaveLength(1);
    expect(svc.parking.get().source.resourceId).toBe('r2');
    const files = await fs.readdir(dir);
    expect(files.sort()).toEqual(['cycleways.json', 'parking.json']);
  });

  it('ne preuzima ponovno svježe podatke iz predmemorije', async () => {
    await service({ value: true }).svc.init();
    const second = service({ value: true });
    await second.svc.init();
    expect(second.http).not.toHaveBeenCalled();
    expect(second.svc.cycleways.get().data.features).toHaveLength(1);
  });

  it('kad portal nije dostupan, koristi posljednju uspješnu verziju', async () => {
    const online = { value: true };
    const { svc } = service(online);
    await svc.init();
    online.value = false;
    const result = await svc.refreshAll();
    expect(result.updated).toEqual({ cycleways: false, parking: false });
    expect(result.status.cycleways.available).toBe(true);
    expect(result.status.cycleways.lastError).toMatch(/nije dostupan/);
    expect(svc.cycleways.get().data.features).toHaveLength(1);
  });

  it('bez ikakvih podataka vraća razumljivu grešku 503', async () => {
    const { svc } = service({ value: false });
    await svc.init();
    expect(() => svc.parking.get()).toThrowError(expect.objectContaining({ code: ErrorCodes.DATA_UNAVAILABLE, status: 503 }));
  });

  it('obavještava routing kad se staze osvježe', async () => {
    const { svc } = service({ value: true });
    const listener = vi.fn();
    svc.onCyclewaysChanged(listener);
    await svc.refreshAll();
    expect(listener).toHaveBeenCalledOnce();
  });
});
