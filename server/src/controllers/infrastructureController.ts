import type { Request, Response } from 'express';
import type { InfrastructureService } from '../services/infrastructure/infrastructureService.js';

export const infrastructureController = (infra: InfrastructureService) => ({
  cycleways(_req: Request, res: Response) {
    const { data, source } = infra.cycleways.get();
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Data-Source', source.resourceUrl);
    res.set('X-Data-Fetched-At', source.fetchedAt);
    res.json(data);
  },

  parking(_req: Request, res: Response) {
    const { data, source } = infra.parking.get();
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Data-Source', source.resourceUrl);
    res.set('X-Data-Fetched-At', source.fetchedAt);
    res.json(data);
  },

  status(_req: Request, res: Response) {
    res.json(infra.status());
  },

  async refresh(_req: Request, res: Response) {
    const result = await infra.refreshAll();
    const anyAvailable = result.status.cycleways.available || result.status.parking.available;
    const allUpdated = result.updated.cycleways && result.updated.parking;
    // 200 – sve osvježeno; 207 – djelomično (koristi se zadnja verzija); 503 – nema nikakvih podataka.
    res.status(allUpdated ? 200 : anyAvailable ? 207 : 503).json(result);
  },
});
