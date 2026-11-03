import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { CkanClient } from '../src/services/ckan/ckanClient.js';
import { GeocodingService } from '../src/services/geocoding/geocodingService.js';
import { InfrastructureService } from '../src/services/infrastructure/infrastructureService.js';
import { RoutingService } from '../src/services/routing/routingService.js';
import { FileCache } from '../src/utils/fileCache.js';
import { HttpError } from '../src/utils/http.js';
import { ladderCycleways, ladderNetwork, latLon, testRoutingConfig } from './helpers.js';

const offlineHttp = vi.fn(async (url: string) => {
  throw new HttpError(url, null, 'ECONNREFUSED');
}) as unknown as <T>(url: string) => Promise<T>;

async function makeApp({ routingReady = true, geocodingHttp = offlineHttp } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zbn-api-'));
  const infrastructure = new InfrastructureService(new CkanClient('https://ckan.test', offlineHttp), new FileCache(dir));
  const routing = new RoutingService(testRoutingConfig());
  if (routingReady) routing.setNetwork(ladderNetwork(), ladderCycleways());
  const geocoding = new GeocodingService(geocodingHttp);
  return createApp({ infrastructure, routing, geocoding });
}

describe('REST API – rute', () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  beforeAll(async () => {
    app = await makeApp();
  });

  it('POST /api/routes vraća rutu i statistiku', async () => {
    const res = await request(app).post('/api/routes').send({ start: latLon(0, 0), end: latLon(1000, 0), mode: 'cycleways' });
    expect(res.status).toBe(200);
    expect(res.body.geometry.type).toBe('LineString');
    expect(res.body).toHaveProperty('distanceM');
    expect(res.body).toHaveProperty('durationS');
    expect(res.body).toHaveProperty('cyclewayDistanceM');
    expect(res.body).toHaveProperty('cyclewayShare');
    expect(res.body.instructions.at(-1).text).toBe('Stigli ste na odredište');
  });

  it('POST /api/routes/recalculate računa rutu od trenutne lokacije', async () => {
    const res = await request(app)
      .post('/api/routes/recalculate')
      .send({ current: latLon(0, 150), end: latLon(1000, 0), mode: 'cycleways' });
    expect(res.status).toBe(200);
    const [lon, lat] = res.body.geometry.coordinates[0];
    const start = latLon(0, 150);
    expect(Math.abs(lon - start.lon)).toBeLessThan(1e-4);
    expect(Math.abs(lat - start.lat)).toBeLessThan(1e-4);
    expect(res.body.distanceM).toBeCloseTo(1250, -1);
  });

  it('validira ulazne podatke (400)', async () => {
    const bad = await request(app).post('/api/routes').send({ start: { lat: 'x', lon: 1 }, end: latLon(1, 1), mode: 'fastest' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const same = await request(app).post('/api/routes').send({ start: latLon(0, 0), end: latLon(0, 0), mode: 'shortest' });
    expect(same.status).toBe(400);
    const json = await request(app).post('/api/routes').set('Content-Type', 'application/json').send('{nije json');
    expect(json.status).toBe(400);
  });

  it('nepovezane točke → 422', async () => {
    const res = await request(app).post('/api/routes').send({ start: latLon(0, 0), end: latLon(3200, 3000), mode: 'shortest' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('POINTS_NOT_CONNECTED');
  });

  it('nepostojeći endpoint → 404', async () => {
    expect((await request(app).get('/api/nema')).status).toBe(404);
  });
});

describe('REST API – nedostupni vanjski servisi', () => {
  it('routing engine u pripremi → 503', async () => {
    const app = await makeApp({ routingReady: false });
    const res = await request(app).post('/api/routes').send({ start: latLon(0, 0), end: latLon(1000, 0), mode: 'shortest' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ROUTING_UNAVAILABLE');
  });

  it('CKAN nedostupan i nema predmemorije → 503 s porukom', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/infrastructure/cycleways');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/nisu dostupni/);
    const refresh = await request(app).post('/api/infrastructure/refresh');
    expect(refresh.status).toBe(503);
    expect(refresh.body.status.cycleways.lastError).toMatch(/nije dostupan/);
  });

  it('geokodiranje nedostupno → 502', async () => {
    const app = await makeApp();
    const res = await request(app).get('/api/geocoding/search?q=Ilica');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GEOCODING_UNAVAILABLE');
  });

  it('geokodiranje: rezervni servis (Nominatim) kad Photon ne radi', async () => {
    const http = vi.fn(async (url: string) => {
      if (url.includes('photon')) throw new HttpError(url, 500, 'HTTP 500');
      return [{ lat: '45.8131', lon: '15.9775', display_name: 'Trg bana Josipa Jelačića, Donji grad, Zagreb', name: 'Trg bana Josipa Jelačića' }];
    }) as unknown as <T>(url: string) => Promise<T>;
    const app = await makeApp({ geocodingHttp: http });
    const res = await request(app).get('/api/geocoding/search?q=Trg bana');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ label: 'Trg bana Josipa Jelačića', source: 'nominatim' });
  });

  it('geokodiranje bez rezultata → 404', async () => {
    const http = vi.fn(async () => ({ features: [] })) as unknown as <T>(url: string) => Promise<T>;
    const app = await makeApp({ geocodingHttp: http });
    const res = await request(app).get('/api/geocoding/search?q=Nepostojeće mjesto');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GEOCODING_FAILED');
  });
});
