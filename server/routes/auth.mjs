import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';

import { usersCollection } from '../db.mjs';
import { hashPassword, verifyPassword, issueToken, requireAdmin } from '../auth.mjs';
import { sendMail, verificationTemplate, welcomeTemplate } from '../mailer.mjs';
import { authorizeUrl, exchangeCode, googleConfigured, verifyState } from '../google-oauth.mjs';

export const authRouter = Router();

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  emailVerified: Boolean(u.emailVerified),
  picture: u.picture ?? null,
  provider: u.provider ?? 'password',
});

const normaliseEmail = (email) => String(email ?? '').trim().toLowerCase();

/** Tokens are stored hashed, so a database leak does not hand out accounts. */
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

async function nextUserId(users) {
  const [highest] = await users.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray();
  return (highest?.id ?? 0) + 1;
}

/** Anyone on this list becomes an admin the first time they sign in. */
function isOwnerEmail(email) {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

async function issueVerification(users, user) {
  const token = randomBytes(32).toString('base64url');
  await users.updateOne(
    { id: user.id },
    { $set: { verificationTokenHash: hashToken(token), verificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS) } },
  );
  return sendMail({ to: user.email, ...verificationTemplate(user, token) });
}

// ── Password accounts ──────────────────────────────────────────────────────

authRouter.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const email = normaliseEmail(req.body?.email);
    const password = String(req.body?.password ?? '');

    if (!name || !EMAIL_RE.test(email) || password.length < 8) {
      return res.status(400).json({
        error: 'Enter your name, a valid email address, and a password of at least 8 characters.',
      });
    }

    const users = await usersCollection();
    if (await users.findOne({ email })) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }

    // Role is never taken from the request body — self-promotion would be trivial.
    const user = {
      id: await nextUserId(users),
      name,
      email,
      password: await hashPassword(password),
      role: isOwnerEmail(email) ? 'admin' : 'user',
      provider: 'password',
      emailVerified: false,
      createdAt: new Date(),
    };

    await users.insertOne(user);
    const mail = await issueVerification(users, user);

    res.status(201).json({
      user: publicUser(user),
      token: issueToken(user),
      verificationEmailSent: mail.sent,
      // Told plainly rather than pretending a mail went out.
      notice: mail.sent
        ? 'Check your inbox to verify your email address.'
        : 'Account created. Email verification could not be sent — SMTP is not configured.',
    });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const users = await usersCollection();
    const user = await users.findOne({ email: normaliseEmail(req.body?.email) });

    if (!user?.password || !(await verifyPassword(String(req.body?.password ?? ''), user.password))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    res.json({ user: publicUser(user), token: issueToken(user) });
  } catch (e) {
    next(e);
  }
});

// ── Email verification ─────────────────────────────────────────────────────

authRouter.get('/verify', async (req, res, next) => {
  try {
    const token = String(req.query.token ?? '');
    if (!token) return res.redirect('/login?verified=invalid');

    const users = await usersCollection();
    const user = await users.findOne({
      verificationTokenHash: hashToken(token),
      verificationExpires: { $gt: new Date() },
    });

    if (!user) return res.redirect('/login?verified=invalid');

    await users.updateOne(
      { id: user.id },
      {
        $set: { emailVerified: true, emailVerifiedAt: new Date() },
        $unset: { verificationTokenHash: '', verificationExpires: '' },
      },
    );

    await sendMail({ to: user.email, ...welcomeTemplate(user) });
    res.redirect('/login?verified=1');
  } catch (e) {
    next(e);
  }
});

authRouter.post('/resend-verification', async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Sign in first.' });

    const users = await usersCollection();
    const user = await users.findOne({ id: req.user.sub });
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    if (user.emailVerified) return res.status(409).json({ error: 'Your email is already verified.' });

    const mail = await issueVerification(users, user);
    res.json({ sent: mail.sent, error: mail.error ?? null });
  } catch (e) {
    next(e);
  }
});

// ── Google sign-in ─────────────────────────────────────────────────────────

authRouter.get('/google', (req, res) => {
  if (!googleConfigured()) {
    return res.redirect('/login?sso=unconfigured');
  }
  res.redirect(authorizeUrl(req, String(req.query.returnTo ?? '/')));
});

authRouter.get('/google/callback', async (req, res, next) => {
  try {
    if (req.query.error) return res.redirect('/login?sso=denied');

    const state = verifyState(req.query.state);
    if (!state) return res.redirect('/login?sso=state');

    const profile = await exchangeCode(req, String(req.query.code ?? ''));
    const users = await usersCollection();

    let user = await users.findOne({ email: profile.email });

    if (user) {
      // Google has verified this address, so linking it is safe and the account
      // can be treated as verified from here on.
      await users.updateOne(
        { id: user.id },
        {
          $set: {
            googleId: profile.googleId,
            emailVerified: true,
            picture: user.picture ?? profile.picture,
            lastLoginAt: new Date(),
            ...(isOwnerEmail(profile.email) && { role: 'admin' }),
          },
        },
      );
      user = await users.findOne({ id: user.id });
    } else {
      user = {
        id: await nextUserId(users),
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        picture: profile.picture,
        role: isOwnerEmail(profile.email) ? 'admin' : 'user',
        provider: 'google',
        emailVerified: true,
        createdAt: new Date(),
      };
      await users.insertOne(user);
      await sendMail({ to: user.email, ...welcomeTemplate(user) });
    }

    // The SPA reads the token off the URL once and then scrubs it from history.
    const target = state.returnTo?.startsWith('/') ? state.returnTo : '/';
    res.redirect(`/auth/callback#token=${issueToken(user)}&returnTo=${encodeURIComponent(target)}`);
  } catch (e) {
    console.error('[auth] Google sign-in failed:', e.message);
    res.redirect('/login?sso=failed');
  }
});

// ── Session ────────────────────────────────────────────────────────────────

authRouter.get('/me', async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    const users = await usersCollection();
    const user = await users.findOne({ id: req.user.sub });
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/providers', (_req, res) =>
  res.json({ password: true, google: googleConfigured() }),
);

authRouter.get('/users', requireAdmin, async (_req, res, next) => {
  try {
    const users = await usersCollection();
    const list = await users
      .find({}, { projection: { _id: 0, password: 0, verificationTokenHash: 0, verificationExpires: 0 } })
      .sort({ id: 1 })
      .toArray();
    res.json(list);
  } catch (e) {
    next(e);
  }
});
