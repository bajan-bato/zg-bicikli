import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../../../shared/types/index.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export const notFound: RequestHandler = (req, res) => {
  const body: ApiErrorBody = { error: { code: ErrorCodes.NOT_FOUND, message: `Ruta ${req.method} ${req.path} ne postoji.` } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody;
  if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: ErrorCodes.VALIDATION,
        message: 'Neispravni ulazni podaci.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  } else if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: ErrorCodes.VALIDATION, message: 'Tijelo zahtjeva nije ispravan JSON.' } };
  } else {
    console.error('[api] Neočekivana greška:', err);
    body = { error: { code: ErrorCodes.INTERNAL, message: 'Došlo je do neočekivane greške na poslužitelju.' } };
  }
  res.status(status).json(body);
};

/** Omotač za async handlere – greške prosljeđuje errorHandleru. */
export const asyncHandler =
  (fn: (...args: Parameters<RequestHandler>) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
