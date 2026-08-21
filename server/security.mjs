import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

/**
 * Security headers and request throttling.
 *
 * Kept in one file so the whole posture of the app can be read at a glance,
 * rather than being scattered through route handlers.
 */

/** Origins the storefront legitimately loads from. */
const CDN = 'https://cdn.jsdelivr.net';
const FONTS_CSS = 'https://fonts.googleapis.com';
const FONTS_FILES = 'https://fonts.gstatic.com';

/**
 * Whether the site is actually reachable over HTTPS.
 *
 * This drives HSTS and upgrade-insecure-requests, and it is deliberately not
 * keyed on NODE_ENV: a production build served over plain HTTP — a container
 * run locally, or a staging box without a certificate — would tell the browser
 * to rewrite every request to https:// and the site would stop loading
 * entirely. What matters is the scheme, so that is what is checked.
 */
const servedOverHttps = () => (process.env.PUBLIC_ORIGIN ?? '').startsWith('https://');

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],

        // No 'unsafe-inline' here on purpose: the theme script was moved out of
        // index.html into theme-init.js so injected inline script simply cannot run.
        scriptSrc: ["'self'"],

        // Angular inlines its critical CSS at build time and writes component
        // styles into <style> tags at runtime, so inline styles must be allowed.
        // This is far lower risk than allowing inline script.
        styleSrc: ["'self'", "'unsafe-inline'", CDN, FONTS_CSS],
        fontSrc: ["'self'", FONTS_FILES, CDN, 'data:'],

        // Product photography comes from whichever retailer CDNs the catalogue
        // was built from, and those change when it is rebuilt. Restricting this
        // to a fixed list would break the shop on the next catalogue refresh.
        imgSrc: ["'self'", 'data:', 'https:'],

        connectSrc: ["'self'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: servedOverHttps() ? [] : null,
      },
    },

    // Product images are hotlinked from third-party CDNs, which do not send
    // CORP headers. The strict default would block every one of them.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    // Referrer is trimmed to the origin so full order URLs never leak outward.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // Two years — but only once the site is genuinely on HTTPS. Sending HSTS
    // from an HTTP origin is ignored by browsers at best and locks users out of
    // the site at worst if it is ever served without a certificate.
    hsts: servedOverHttps() ? { maxAge: 63072000, includeSubDomains: true } : false,
  });
}

/**
 * Throttles by IP. `ipKeyGenerator` is used rather than `req.ip` directly so
 * IPv6 clients are grouped by subnet — otherwise an attacker with a /64 gets a
 * fresh budget from every address in it.
 */
const byIp = (req) => ipKeyGenerator(req.ip);

const limiter = (options) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: byIp,
    ...options,
  });

/**
 * Sign-in, registration and verification resends. Deliberately tight: this is
 * the endpoint an attacker points a password list at. Successful sign-ins are
 * not counted, so a legitimate user is never locked out by their own activity.
 */
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
});

/** Order placement — generous for a real shopper, useless for a spammer. */
export const orderLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: 'Too many orders from this connection. Please contact us on WhatsApp.' },
});

/** Everything else under /api. High enough that normal browsing never notices. */
export const apiLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: { error: 'Too many requests. Please slow down.' },
});
