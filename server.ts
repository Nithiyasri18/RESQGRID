import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { getDb } from './server/db.ts';
import { createApiRouter } from './server/routes.ts';
import { seedDatabase } from './server/seed.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // Initialize SQLite database, run idempotent migrations, and seed academic data
  const db = getDb();
  seedDatabase(db);

  // Mount versioned REST API
  app.use('/api/v1', createApiRouter(db));

  // Structured JSON error handler
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[RESQGRID API Error]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Fallback for client-side SPA routes in dev if not handled by Vite
    app.get('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[RESQGRID] Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RESQGRID server:', err);
  process.exit(1);
});
