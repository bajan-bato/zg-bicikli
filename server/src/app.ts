import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiRouter, type Services } from './routes/index.js';

/** Sastavlja Express aplikaciju; servisi se ubacuju izvana (olakšava testiranje). */
export function createApp(services: Services, options: { serveClient?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiRouter(services));
  app.use('/api', notFound);

  // U produkciji isti proces poslužuje i izgrađeni frontend (monolit).
  if (options.serveClient && fs.existsSync(config.clientDistDir)) {
    app.use(express.static(config.clientDistDir, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDistDir, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
