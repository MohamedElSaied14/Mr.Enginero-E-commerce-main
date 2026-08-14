/**
 * Captures the screenshots the audit report embeds.
 *
 * Uses Chrome's own `--screenshot` flag rather than a driver library — no extra
 * dependency, and nothing to keep in sync with a Chrome version.
 *
 * Admin pages are reached through `/auth/callback#token=…`, the same route the
 * Google sign-in redirect uses: it stores the session token and forwards on.
 * Dashboard tabs are deep-linked with `?tab=`.
 *
 * Run:  npm run screens
 */
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'screens');
const BASE = process.env.SCREENS_BASE || 'http://localhost:3000';

const DESKTOP = [1440, 900];
const MOBILE = [390, 844];

/** [file, path, size, { admin, caption }] */
const SHOTS = [
  ['01-home-desktop', '/', DESKTOP, { caption: 'Home — hero, live counters and category tiles' }],
  ['02-home-mobile', '/', MOBILE, { caption: 'Home on a phone — category tiles collapse to a dropdown' }],
  ['03-shop-desktop', '/shop', DESKTOP, { caption: 'Shop — filter sidebar, sort and 24-per-page grid' }],
  ['04-shop-mobile', '/shop', MOBILE, { caption: 'Shop on a phone — filters behind a button with an active count' }],
  ['05-product-desktop', '/product/3', DESKTOP, { caption: 'Product — gallery, original price, stock and related items' }],
  ['06-product-mobile', '/product/3', MOBILE, { caption: 'Product on a phone — single column, 44px quantity stepper' }],
  ['07-deals-desktop', '/deals', DESKTOP, { caption: 'Deals — only genuine reductions, biggest discount first' }],
  ['08-cart-mobile', '/cart', MOBILE, { caption: 'Cart on a phone — lines reflow, summary below' }],
  ['09-checkout-desktop', '/checkout', DESKTOP, { caption: 'Checkout — cash on delivery, live totals' }],
  ['10-checkout-mobile', '/checkout', MOBILE, { caption: 'Checkout on a phone — 16px inputs so iOS does not zoom' }],
  ['11-login-desktop', '/login', DESKTOP, { caption: 'Sign in — Google SSO, no demo accounts' }],
  ['12-register-desktop', '/register', DESKTOP, { caption: 'Register — 8-character minimum, email verification explained' }],
  ['13-dashboard-orders', '/dashboard', DESKTOP, { admin: true, caption: 'Dashboard · Orders — KPIs, mail-transport banner, order board' }],
  ['14-dashboard-catalogue', '/dashboard?tab=catalogue', DESKTOP, { admin: true, caption: 'Dashboard · Catalogue — price provenance per product' }],
  ['15-dashboard-users', '/dashboard?tab=users', DESKTOP, { admin: true, caption: 'Dashboard · Users — roles, verification, protected accounts' }],
  ['16-dashboard-settings', '/dashboard?tab=settings', DESKTOP, { admin: true, caption: 'Dashboard · Settings — live fees and system status' }],
  ['17-suppliers-desktop', '/stores', DESKTOP, { admin: true, caption: 'Supplier directory — Alexandria shops, Sigma flagged not connected' }],
  ['18-dashboard-mobile', '/dashboard', MOBILE, { admin: true, caption: 'Dashboard on a phone — tabs scroll, cards stack' }],
];

function chromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error('No Chrome or Edge found — set CHROME_BIN to the browser executable.');
  return hit;
}

async function adminToken() {
  const email = process.env.SCREENS_ADMIN_EMAIL || process.env.ADMIN_EMAILS?.split(',')[0]?.trim();
  const password = process.env.SCREENS_ADMIN_PASSWORD;
  if (!email || !password) return null;

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.warn('  admin sign-in failed — admin screens would show the login page, skipping them');
    return null;
  }
  return (await res.json()).token;
}

const main = async () => {
  const chrome = chromePath();
  const token = await adminToken();

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const captured = [];

  for (const [name, path, [w, h], opts] of SHOTS) {
    if (opts.admin && !token) continue;

    // The OAuth callback route stores the token, then forwards to the target.
    const url = opts.admin
      ? `${BASE}/auth/callback#token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(path)}`
      : BASE + path;

    const file = join(OUT, `${name}.png`);
    const profile = join(ROOT, `.screens-profile-${name}`);

    try {
      await run(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          '--no-first-run',
          '--no-default-browser-check',
          '--force-color-profile=srgb',
          `--user-data-dir=${profile}`,
          `--window-size=${w},${h}`,
          // Fast-forwards timers so lazy images and the router settle before the shutter.
          '--virtual-time-budget=9000',
          `--screenshot=${file}`,
          url,
        ],
        { timeout: 90_000 },
      );
    } catch {
      // Chrome exits non-zero in some headless builds even after writing the file.
    }
    await rm(profile, { recursive: true, force: true });

    if (!existsSync(file)) {
      console.warn(`  ${name.padEnd(26)} FAILED`);
      continue;
    }

    const { size } = await stat(file);
    captured.push({ name, file: `${name}.png`, path, viewport: `${w}×${h}`, caption: opts.caption, kb: Math.round(size / 1024) });
    console.log(`  ${name.padEnd(26)} ${String(w).padStart(4)}px  ${String(Math.round(size / 1024)).padStart(4)} kB`);
  }

  await writeFile(join(OUT, 'index.json'), JSON.stringify(captured, null, 2));
  console.log(`\n${captured.length}/${SHOTS.length} screenshots → docs/screens/`);
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
