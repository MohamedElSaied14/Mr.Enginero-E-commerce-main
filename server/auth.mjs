import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const secret = () => process.env.AUTH_SECRET || 'dev-only-insecure-secret';

/** Values that are present but are not actually secrets. */
const PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'dev-only-insecure-secret',
  'a-long-random-string',
  'secret',
  'changeme',
]);

/**
 * True when the signing key is missing, a known placeholder, or simply too
 * short to be worth anything. Checking only for presence would call
 * `AUTH_SECRET=change-me-in-production` a configured secret.
 */
export function authSecretIsWeak() {
  const value = (process.env.AUTH_SECRET ?? '').trim();
  return !value || value.length < 24 || PLACEHOLDER_SECRETS.has(value.toLowerCase());
}
const b64url = (buf) => Buffer.from(buf).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored = '') {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Compact signed token: `<base64url(payload)>.<hmac>`. No third-party JWT dependency. */
export function issueToken(user) {
  const payload = b64url(
    JSON.stringify({ sub: user.id, email: user.email, role: user.role, exp: Date.now() + TOKEN_TTL_MS }),
  );
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

export function readToken(token = '') {
  const [payload, signature] = token.split('.');
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

/** Attaches `req.user` when a valid bearer token is present; never rejects. */
export function withUser(req, _res, next) {
  const header = req.get('authorization') || '';
  req.user = header.startsWith('Bearer ') ? readToken(header.slice(7)) : null;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(req.user ? 403 : 401).json({ error: req.user ? 'Admin access required' : 'Sign in required' });
}
