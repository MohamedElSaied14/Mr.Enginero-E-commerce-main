import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureIndexes, getDb, closeDb } from './db.mjs';
import { withUser, requireAdmin, authSecretIsWeak } from './auth.mjs';
import { mailerStatus, verifyMailer } from './mailer.mjs';
import { reportGoogleStatus } from './google-oauth.mjs';
import { productsRouter } from './routes/products.mjs';
import { authRouter } from './routes/auth.mjs';
import { ordersRouter, checkoutConfig } from './routes/orders.mjs';
import { suppliersRouter } from './routes/suppliers.mjs';
import { adminRouter } from './routes/admin.mjs';
import { securityHeaders, apiLimiter, authLimiter, orderLimiter } from './security.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER_DIST = join(ROOT, 'dist', 'shopzone', 'browser');
const PUBLIC_DIR = join(ROOT, 'public');
const PORT = Number(process.env.API_PORT) || 3000;

const app = express();
app.disable('x-powered-by');

/*
 * Behind a reverse proxy (nginx, Railway, Render) the client's real address and
 * the original scheme arrive in X-Forwarded-* headers. Without this Express
 * reports the proxy's own IP — which would make rate limiting throttle every
 * visitor as if they were one person — and reports http even on an https site.
 *
 * `1` means "trust exactly one proxy hop". Set TRUST_PROXY if there are more.
 */
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

app.use(securityHeaders());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use('/api', withUser);

// Throttling. The tight limits are registered first so they win for the
// endpoints that matter; everything else falls through to the general limit.
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/resend-verification'], authLimiter);
app.post('/api/orders', orderLimiter);
app.use('/api', apiLimiter);

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ status: 'ok', db: db.databaseName });
  } catch (e) {
    res.status(503).json({ status: 'unavailable', error: e.message });
  }
});

// Checkout config is mounted outside the orders router so it can't be shadowed
// by the `/:ref` lookup.
app.get('/api/checkout/config', checkoutConfig);
app.get('/api/mail/status', requireAdmin, (_req, res) => res.json(mailerStatus()));

app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/auth', authRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

// `public/` is served ahead of the build output so replacing an asset — the logo,
// say — takes effect on the next request without waiting for `ng build`.
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

// Serve the built SPA when it exists; during `npm run dev` the Angular dev server
// owns the front end and only proxies /api here.
if (existsSync(BROWSER_DIST)) {
  app.use(
    express.static(BROWSER_DIST, {
      // Hashed build assets are immutable; index.html must never be cached.
      setHeaders: (res, path) =>
        res.set(
          'Cache-Control',
          path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        ),
    }),
  );
  app.get('*', (req, res) => {
    // A request with a file extension is an asset, not an Angular route. Serving
    // index.html for those hides missing files behind a 200 and breaks image
    // fallbacks, so let them 404 honestly.
    if (/\.[a-z0-9]{2,5}$/i.test(req.path)) return res.status(404).send('Not found');
    res.sendFile(join(BROWSER_DIST, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const server = app.listen(PORT, async () => {
  console.log(`API listening on http://localhost:${PORT}`);
  try {
    await ensureIndexes();
    console.log('MongoDB connected, indexes ready');
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
  }
  await verifyMailer();
  reportGoogleStatus();

  if (authSecretIsWeak()) {
    console.warn(
      '[auth] AUTH_SECRET is missing, a placeholder, or too short. It signs every session\n' +
        '       token — set a long random value in .env before deploying.',
    );
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => closeDb().finally(() => process.exit(0))));
}
