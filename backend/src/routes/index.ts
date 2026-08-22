import { Elysia, t } from 'elysia';
import { handleVerify } from '../controllers/verify.controller';
import { handleAdminSync } from '../controllers/admin.controller';
import { config } from '../config';

export const app = new Elysia()
  // Global Error Handler
  .onError(({ code, error, set }) => {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Error] Global catcher caught: ${code} - ${errorMsg}`);
    set.status = 500;
    return {
      success: false,
      error: errorMsg || 'Internal Server Error',
    };
  })

  // Health check endpoint
  .get('/health', () => ({ status: 'OK', env: process.env.NODE_ENV || 'development' }))

  // Verification endpoint
  .post('/api/v1/verify', handleVerify, {
    body: t.Object({
      domains: t.Array(t.String()),
    }),
  })

  // Admin sync endpoint
  .post('/api/v1/admin/sync', handleAdminSync)

  // Serve Astro frontend static files or proxy to Astro dev server
  .get('/*', async ({ path, set, request }) => {
    // 1. If in development, proxy directly to Astro's live hot-reloading server
    if (config.NODE_ENV === 'development') {
      try {
        const ASTRO_PORT = process.env.FRONTEND_DEV_PORT || '4321';
        const url = new URL(request.url);
        const astroDevUrl = `http://127.0.0.1:${ASTRO_PORT}${path}${url.search}`;
        const response = await fetch(astroDevUrl);
        return response;
      } catch (err) {
        // Fall back to serving static files if Astro dev server is not running
      }
    }

    // 2. Production Fallback (serving from dist)
    const { join } = await import('path');
    const localPath = join(import.meta.dir, '../../..', 'frontend/dist');
    const dockerPath = join(import.meta.dir, '../..', 'frontend/dist');
    
    const distPath = await Bun.file(join(localPath, 'index.html')).exists()
      ? localPath
      : dockerPath;

    // Prevent directory traversal or accessing files outside dist
    const safePath = path.replace(/\.\./g, '');
    let filePath = join(distPath, safePath);
    
    // Default to index.html for root path
    if (path === '/') {
      filePath = join(distPath, 'index.html');
    }

    let file = Bun.file(filePath);
    if (await file.exists()) {
      if (path.startsWith('/_astro/')) {
        set.headers['cache-control'] = 'public, max-age=31536000, immutable';
      } else {
        set.headers['cache-control'] = 'public, max-age=0, must-revalidate';
      }
      return file;
    }

    // Fallback to 404.html for static site 404s if it exists
    const errorPage = Bun.file(join(distPath, '404.html'));
    if (await errorPage.exists()) {
      set.status = 404;
      set.headers['cache-control'] = 'public, max-age=0, must-revalidate';
      return errorPage;
    }

    // Fallback to index.html for frontend routing/SPAs if index.html exists
    const indexFile = Bun.file(join(distPath, 'index.html'));
    if (await indexFile.exists()) {
      set.headers['cache-control'] = 'public, max-age=0, must-revalidate';
      return indexFile;
    }

    set.status = 404;
    return 'Not Found';
  });
export type App = typeof app;
