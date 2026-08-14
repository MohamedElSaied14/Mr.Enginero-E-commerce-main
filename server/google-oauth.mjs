import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Google sign-in, implemented against the OAuth 2.0 endpoints directly rather
 * than pulling in Passport for one provider.
 *
 * Setup (the store owner has to do this once, in their own Google account):
 *   1. console.cloud.google.com → create a project
 *   2. APIs & Services → OAuth consent screen → External → fill in the app name
 *      and support email → add your Gmail address under "Test users" while the
 *      app is unverified
 *   3. Credentials → Create credentials → OAuth client ID → Web application
 *   4. Authorised redirect URI:  <your origin>/api/auth/google/callback
 *      e.g. http://localhost:3000/api/auth/google/callback for local work
 *   5. Copy the client ID and secret into .env as GOOGLE_CLIENT_ID and
 *      GOOGLE_CLIENT_SECRET
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const STATE_TTL_MS = 10 * 60 * 1000;

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The exact string that has to be registered in Google Cloud. */
export function expectedRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const origin = (process.env.PUBLIC_ORIGIN || `http://localhost:${process.env.API_PORT || 3000}`).replace(/\/$/, '');
  return `${origin}/api/auth/google/callback`;
}

/** Logged at boot so a mismatch is obvious before anyone clicks the button. */
export function reportGoogleStatus() {
  if (!googleConfigured()) {
    console.warn('[auth] Google sign-in is off — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.');
    return;
  }
  console.log(`[auth] Google sign-in ready. Registered redirect URI must be exactly:`);
  console.log(`       ${expectedRedirectUri()}`);
}

const secret = () => process.env.AUTH_SECRET || 'dev-only-insecure-secret';

/**
 * Google matches the redirect URI character for character against what is
 * registered, so it must not vary with how the site was reached. During
 * development the Angular dev server answers on :4200 while the API is on
 * :3000 — deriving the URI from the request host would send Google a :4200
 * address that was never registered, and the sign-in fails with
 * redirect_uri_mismatch. PUBLIC_ORIGIN pins it.
 */
function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  if (process.env.PUBLIC_ORIGIN) {
    return `${process.env.PUBLIC_ORIGIN.replace(/\/$/, '')}/api/auth/google/callback`;
  }

  // Last resort: the request itself. Behind a proxy the original scheme and
  // host arrive as forwarded headers.
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}/api/auth/google/callback`;
}

/**
 * CSRF protection without server-side session storage: the state is a nonce
 * plus an HMAC over it, so the callback can prove it issued the value itself.
 */
function issueState(returnTo = '/') {
  const payload = Buffer.from(
    JSON.stringify({ nonce: randomBytes(12).toString('hex'), returnTo, exp: Date.now() + STATE_TTL_MS }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

function readState(state = '') {
  const [payload, signature] = String(state).split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return claims.exp > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(req, returnTo) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state: issueState(returnTo),
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export function verifyState(state) {
  return readState(state);
}

/** Swaps the one-time code for tokens, then reads the verified profile. */
export async function exchangeCode(req, code) {
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }

  const { access_token: accessToken } = await tokenRes.json();

  const profileRes = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error(`Google userinfo failed: ${profileRes.status}`);

  const profile = await profileRes.json();

  // Google tells us whether it has verified the address; an unverified one is
  // not proof of ownership, so it does not get to claim an existing account.
  if (!profile.email || profile.email_verified === false) {
    throw new Error('Google did not return a verified email address');
  }

  return {
    googleId: profile.sub,
    email: String(profile.email).toLowerCase(),
    name: profile.name || String(profile.email).split('@')[0],
    picture: profile.picture ?? null,
  };
}
