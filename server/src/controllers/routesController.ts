import type { Request, Response } from 'express';
import type { RoutingService } from '../services/routing/routingService.js';
import { recalculateRequestSchema, routeRequestSchema } from './validation.js';

export const routesController = (routing: RoutingService) => ({
  calculate(req: Request, res: Response) {
    const body = routeRequestSchema.parse(req.body);
    res.json(routing.route(body.start, body.end, body.mode, body.options));
  },

  recalculate(req: Request, res: Response) {
    const body = recalculateRequestSchema.parse(req.body);
    res.json(routing.route(body.current, body.end, body.mode, body.options));
  },
});
