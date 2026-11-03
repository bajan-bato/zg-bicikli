import { z } from 'zod';

export const latLonSchema = z.object({
  lat: z.number({ invalid_type_error: 'lat mora biti broj' }).min(-90).max(90),
  lon: z.number({ invalid_type_error: 'lon mora biti broj' }).min(-180).max(180),
});

export const modeSchema = z.enum(['shortest', 'cycleways'], {
  errorMap: () => ({ message: 'Vrsta rute mora biti "shortest" ili "cycleways".' }),
});

const optionsSchema = z
  .object({
    roadPenalty: z.number().min(0).max(10).optional(),
    maxDetourFactor: z.number().min(1).max(3).optional(),
  })
  .optional();

const notSame = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.abs(a.lat - b.lat) > 1e-6 || Math.abs(a.lon - b.lon) > 1e-6;

export const routeRequestSchema = z
  .object({ start: latLonSchema, end: latLonSchema, mode: modeSchema, options: optionsSchema })
  .refine((v) => notSame(v.start, v.end), { message: 'Polazište i odredište ne smiju biti ista točka.', path: ['end'] });

export const recalculateRequestSchema = z
  .object({
    current: latLonSchema,
    end: latLonSchema,
    mode: modeSchema,
    options: optionsSchema,
  })
  .refine((v) => notSame(v.current, v.end), { message: 'Već ste na odredištu.', path: ['end'] });

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2, 'Upit mora imati barem 2 znaka.').max(200),
});

export const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});
