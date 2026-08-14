import { Router } from 'express';

import { usersCollection, ordersCollection, productsCollection, getDb } from '../db.mjs';
import { requireAdmin, authSecretIsWeak } from '../auth.mjs';
import { mailerStatus } from '../mailer.mjs';
import { googleConfigured } from '../google-oauth.mjs';
import { getSettings, updateSettings, DEFAULTS } from '../settings.mjs';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const PUBLIC_USER = { _id: 0, password: 0, verificationTokenHash: 0, verificationExpires: 0 };

/** Addresses that are admins by configuration — their role cannot be revoked here. */
const ownerEmails = () =>
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// ── Users ──────────────────────────────────────────────────────────────────

/** GET /api/admin/users — everyone with an account, plus what they have ordered. */
adminRouter.get('/users', async (req, res, next) => {
  try {
    const users = await usersCollection();
    const orders = await ordersCollection();

    const q = String(req.query.q ?? '').trim();
    const filter = q
      ? (() => {
          const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          return { $or: [{ name: rx }, { email: rx }] };
        })()
      : {};

    const list = await users.find(filter, { projection: PUBLIC_USER }).sort({ createdAt: -1 }).toArray();

    // One aggregation for everyone's order history rather than a query per row.
    const spend = await orders
      .aggregate([
        { $match: { status: { $ne: 'cancelled' } } },
        { $group: { _id: '$customer.email', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
      ])
      .toArray();
    const byEmail = new Map(spend.map((s) => [s._id, s]));

    const owners = ownerEmails();
    res.json({
      items: list.map((u) => ({
        ...u,
        isOwner: owners.includes(u.email),
        orders: byEmail.get(u.email)?.orders ?? 0,
        spent: byEmail.get(u.email)?.spent ?? 0,
      })),
      total: list.length,
      admins: list.filter((u) => u.role === 'admin').length,
      owners,
    });
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/admin/users/:id/role — promote or demote. */
adminRouter.patch('/users/:id/role', async (req, res, next) => {
  try {
    const role = req.body?.role;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "admin" or "user".' });
    }

    const users = await usersCollection();
    const target = await users.findOne({ id: Number(req.params.id) });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (target.id === req.user.sub) {
      return res.status(409).json({ error: 'You cannot change your own role.' });
    }
    if (role === 'user' && ownerEmails().includes(target.email)) {
      return res.status(409).json({
        error: `${target.email} is an owner address in ADMIN_EMAILS — remove it there first.`,
      });
    }
    // Never leave the store without an administrator.
    if (role === 'user' && (await users.countDocuments({ role: 'admin' })) <= 1) {
      return res.status(409).json({ error: 'This is the only admin left.' });
    }

    const updated = await users.findOneAndUpdate(
      { id: target.id },
      { $set: { role, roleChangedAt: new Date(), roleChangedBy: req.user.email } },
      { returnDocument: 'after', projection: PUBLIC_USER },
    );
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/admin/users/:id/verify — confirm an address by hand. */
adminRouter.patch('/users/:id/verify', async (req, res, next) => {
  try {
    const users = await usersCollection();
    const updated = await users.findOneAndUpdate(
      { id: Number(req.params.id) },
      {
        $set: { emailVerified: true, emailVerifiedAt: new Date(), verifiedBy: req.user.email },
        $unset: { verificationTokenHash: '', verificationExpires: '' },
      },
      { returnDocument: 'after', projection: PUBLIC_USER },
    );
    if (!updated) return res.status(404).json({ error: 'User not found.' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/admin/users/:id */
adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    const users = await usersCollection();
    const target = await users.findOne({ id: Number(req.params.id) });
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (target.id === req.user.sub) {
      return res.status(409).json({ error: 'You cannot delete your own account.' });
    }
    if (ownerEmails().includes(target.email)) {
      return res.status(409).json({ error: 'Owner accounts cannot be deleted from here.' });
    }

    await users.deleteOne({ id: target.id });
    // Orders are deliberately kept: they are business records, not personal preferences.
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ── Settings ───────────────────────────────────────────────────────────────

/** GET /api/admin/settings — editable settings plus read-only system status. */
adminRouter.get('/settings', async (_req, res, next) => {
  try {
    const settings = await getSettings();
    const mail = mailerStatus();

    let dbStatus = { connected: false, name: null, error: null };
    try {
      const db = await getDb();
      await db.command({ ping: 1 });
      dbStatus = { connected: true, name: db.databaseName, error: null };
    } catch (e) {
      dbStatus.error = e.message;
    }

    const products = await productsCollection();
    const orders = await ordersCollection();
    const users = await usersCollection();

    res.set('Cache-Control', 'private, no-store');
    res.json({
      settings,
      defaults: DEFAULTS,
      system: {
        database: dbStatus,
        mail: {
          configured: mail.configured,
          mode: mail.mode,
          managerInbox: mail.managerInbox,
          from: mail.from,
        },
        googleSignIn: { configured: googleConfigured() },
        adminEmails: ownerEmails(),
        publicOrigin: process.env.PUBLIC_ORIGIN ?? null,
        authSecretIsDefault: authSecretIsWeak(),
        counts: {
          products: await products.countDocuments(),
          orders: await orders.countDocuments(),
          users: await users.countDocuments(),
        },
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  } catch (e) {
    next(e);
  }
});

/** PUT /api/admin/settings */
adminRouter.put('/settings', async (req, res, next) => {
  try {
    res.json({ settings: await updateSettings(req.body, req.user.email) });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});
