import { Router } from 'express';
import type { HealthStatus, PublicConfig } from '../../../shared/types/index.js';
import { config } from '../config/index.js';
import { geocodingController } from '../controllers/geocodingController.js';
import { infrastructureController } from '../controllers/infrastructureController.js';
import { routesController } from '../controllers/routesController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { GeocodingService } from '../services/geocoding/geocodingService.js';
import type { InfrastructureService } from '../services/infrastructure/infrastructureService.js';
import type { RoutingService } from '../services/routing/routingService.js';

export interface Services {
  infrastructure: InfrastructureService;
  routing: RoutingService;
  geocoding: GeocodingService;
}

export function apiRouter(services: Services): Router {
  const router = Router();
  const infra = infrastructureController(services.infrastructure);
  const routes = routesController(services.routing);
  const geo = geocodingController(services.geocoding);

  router.get('/health', (_req, res) => {
    const body: HealthStatus = {
      status: 'ok',
      routing: services.routing.health(),
      infrastructure: services.infrastructure.status(),
    };
    res.json(body);
  });

  router.get('/config', (_req, res) => {
    const body: PublicConfig = {
      averageSpeedKmh: config.routing.averageSpeedKmh,
      mapCenter: config.area.center,
      bbox: config.area.bbox,
      navigation: config.navigation,
    };
    res.json(body);
  });

  router.get('/infrastructure/cycleways', infra.cycleways);
  router.get('/infrastructure/parking', infra.parking);
  router.get('/infrastructure/status', infra.status);
  router.post('/infrastructure/refresh', asyncHandler(infra.refresh));

  router.get('/geocoding/search', asyncHandler(geo.search));
  router.get('/geocoding/reverse', asyncHandler(geo.reverse));

  router.post('/routes', routes.calculate);
  router.post('/routes/recalculate', routes.recalculate);

  return router;
}
