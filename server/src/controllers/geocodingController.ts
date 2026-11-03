import type { Request, Response } from 'express';
import type { GeocodingService } from '../services/geocoding/geocodingService.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { geocodeQuerySchema, reverseQuerySchema } from './validation.js';

export const geocodingController = (geocoding: GeocodingService) => ({
  async search(req: Request, res: Response) {
    const { q } = geocodeQuerySchema.parse(req.query);
    const results = await geocoding.search(q);
    if (results.length === 0) {
      throw new AppError(404, ErrorCodes.GEOCODING_FAILED, `Lokacija "${q}" nije pronađena na području Zagreba.`);
    }
    res.json(results);
  },

  async reverse(req: Request, res: Response) {
    const { lat, lon } = reverseQuerySchema.parse(req.query);
    res.json(await geocoding.reverse(lat, lon));
  },
});
