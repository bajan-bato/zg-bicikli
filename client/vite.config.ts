/// <reference types="vitest" />
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// HTTPS=1 npm run dev:https  → samopotpisani certifikat i pristup s mobitela u lokalnoj mreži
// (Geolocation API na mobilnim preglednicima radi samo u sigurnom kontekstu).
const https = process.env.HTTPS === '1';
const apiTarget = process.env.API_URL ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: https ? true : 'localhost',
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
