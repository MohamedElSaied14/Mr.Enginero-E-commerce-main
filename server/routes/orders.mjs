import { Router } from 'express';

import { ordersCollection, productsCollection } from '../db.mjs';
import { requireAdmin } from '../auth.mjs';
import {
  customerConfirmationTemplate,
  managerAlertTemplate,
  manualMessageTemplate,
  mailerStatus,
  sendMail,
  statusUpdateTemplate,
} from '../mailer.mjs';

export const ordersRouter = Router();

const PROJECTION = { _id: 0 };

// Fees come from the settings document so the owner can change them in the
// dashboard without a redeploy.
import { getSettings } from '../settings.mjs';

const STATUS_FLOW = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
/** Statuses that still hold reserved stock — cancelling from these returns it. */
const HOLDS_STOCK = new Set(['pending', 'confirmed', 'preparing', 'shipped']);

const GOVERNORATES = [
  'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Dakahlia', 'Sharqia', 'Gharbia', 'Monufia',
  'Beheira', 'Kafr El Sheikh', 'Damietta', 'Port Said', 'Ismailia', 'Suez', 'North Sinai',
  'South Sinai', 'Beni Suef', 'Faiyum', 'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan',
  'Red Sea', 'New Valley', 'Matrouh',
];

/** Egyptian mobile: 010/011/012/015 + 8 digits, with or without +20. */
const PHONE_RE = /^(?:\+?20)?0?1[0125]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const normalisePhone = (raw = '') => {
  const digits = String(raw).replace(/[\s()-]/g, '').replace(/^\+?20/, '');
  return digits.startsWith('0') ? digits : `0${digits}`;
};

/** MRE-20260811-0007 — readable on the phone, sortable, unique per day. */
async function nextReference(orders) {
  const today = new Date();
  const stamp = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');

  const todayCount = await orders.countDocuments({ ref: { $regex: `^MRE-${stamp}-` } });
  return `MRE-${stamp}-${String(todayCount + 1).padStart(4, '0')}`;
}

function validateCheckout(body, maxUnitsPerLine) {
  const errors = [];

  const name = String(body?.customer?.name ?? '').trim();
  const phoneRaw = String(body?.customer?.phone ?? '').trim();
  const email = String(body?.customer?.email ?? '').trim().toLowerCase();
  const governorate = String(body?.address?.governorate ?? '').trim();
  const city = String(body?.address?.city ?? '').trim();
  const street = String(body?.address?.street ?? '').trim();
  const notes = String(body?.address?.notes ?? '').trim().slice(0, 500);

  if (name.length < 3) errors.push('Enter the full name of the person receiving the order.');
  if (!PHONE_RE.test(normalisePhone(phoneRaw))) errors.push('Enter a valid Egyptian mobile number, e.g. 01012345678.');
  if (email && !EMAIL_RE.test(email)) errors.push('That email address does not look right.');
  if (!GOVERNORATES.includes(governorate)) errors.push('Choose a governorate from the list.');
  if (city.length < 2) errors.push('Enter the city or district.');
  if (street.length < 8) errors.push('Enter the street address, including building and flat number.');

  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) errors.push('Your cart is empty.');
  if (items.length > 40) errors.push('Too many lines in one order.');

  const requested = items
    .map((line) => ({ productId: Number(line?.productId), quantity: Math.floor(Number(line?.quantity)) }))
    .filter((line) => Number.isInteger(line.productId) && line.productId > 0);

  if (requested.length !== items.length) errors.push('One of the cart lines is malformed.');
  if (requested.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > maxUnitsPerLine)) {
    errors.push(`Each line must be between 1 and ${maxUnitsPerLine} units.`);
  }

  return {
    errors,
    draft: {
      customer: { name, phone: normalisePhone(phoneRaw), email },
      address: { governorate, city, street, notes },
      requested,
    },
  };
}

/**
 * Reserves stock line by line. Each decrement is guarded by `quantity >= n`,
 * so two shoppers racing for the last unit cannot both win. If any line fails
 * the already-reserved ones are put straight back.
 */
async function reserveStock(products, lines) {
  const reserved = [];

  for (const line of lines) {
    const updated = await products.findOneAndUpdate(
      { id: line.productId, quantity: { $gte: line.quantity } },
      { $inc: { quantity: -line.quantity } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, name: 1, quantity: 1 } },
    );

    if (!updated) {
      await releaseStock(products, reserved);
      return { ok: false, failedProductId: line.productId };
    }
    reserved.push(line);
  }

  return { ok: true, reserved };
}

async function releaseStock(products, lines) {
  if (!lines.length) return;
  await products.bulkWrite(
    lines.map((line) => ({
      updateOne: { filter: { id: line.productId }, update: { $inc: { quantity: line.quantity } } },
    })),
    { ordered: false },
  );
}

/** POST /api/orders — place a cash-on-delivery order. Guests allowed. */
ordersRouter.post('/', async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!settings.acceptingOrders) {
      return res.status(503).json({
        error: 'We are not taking orders right now. Please try again shortly or message us on WhatsApp.',
      });
    }

    const { errors, draft } = validateCheckout(req.body, settings.maxUnitsPerLine);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const products = await productsCollection();
    const orders = await ordersCollection();

    // Prices always come from the database. Anything the client sent is ignored.
    const catalogue = await products
      .find({ id: { $in: draft.requested.map((l) => l.productId) } })
      .toArray();
    const byId = new Map(catalogue.map((p) => [p.id, p]));

    const missing = draft.requested.filter((l) => !byId.has(l.productId));
    if (missing.length) {
      return res.status(409).json({ error: 'One of the products is no longer available.', unavailable: missing.map((l) => l.productId) });
    }

    const shortfall = draft.requested.filter((l) => byId.get(l.productId).quantity < l.quantity);
    if (shortfall.length) {
      const p = byId.get(shortfall[0].productId);
      return res.status(409).json({
        error: `Only ${p.quantity} left of "${p.name.slice(0, 50)}". Please adjust the quantity.`,
        unavailable: shortfall.map((l) => l.productId),
      });
    }

    const items = draft.requested.map((line) => {
      const product = byId.get(line.productId);
      return {
        productId: product.id,
        name: product.name,
        brand: product.brand,
        imgUrl: product.imgUrl,
        unitPrice: product.price,
        originalPrice: product.originalPrice,
        quantity: line.quantity,
        lineTotal: product.price * line.quantity,
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const savings = items.reduce((sum, i) => sum + (i.originalPrice - i.unitPrice) * i.quantity, 0);
    const shipping = subtotal >= settings.freeShippingOver ? 0 : settings.shippingFee;
    const codFee = settings.codFee;

    const reservation = await reserveStock(products, draft.requested);
    if (!reservation.ok) {
      const p = byId.get(reservation.failedProductId);
      return res.status(409).json({
        error: `"${p?.name?.slice(0, 50) ?? 'An item'}" sold out while you were checking out.`,
        unavailable: [reservation.failedProductId],
      });
    }

    const now = new Date();
    const order = {
      id: now.getTime(),
      ref: await nextReference(orders),
      status: 'pending',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      customer: draft.customer,
      address: draft.address,
      userId: req.user?.sub ?? null,
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      subtotal,
      savings,
      shipping,
      codFee,
      total: subtotal + shipping + codFee,
      currency: 'EGP',
      statusHistory: [{ status: 'pending', at: now, by: 'customer', note: 'Order placed on the storefront' }],
      contactLog: [],
      emails: {},
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Two orders placed in the same second can compute the same reference;
      // the unique index catches it and we simply take the next number.
      for (let attempt = 0; ; attempt++) {
        try {
          await orders.insertOne(order);
          break;
        } catch (e) {
          if (e?.code !== 11000 || attempt >= 5) throw e;
          order.ref = await nextReference(orders);
        }
      }
    } catch (e) {
      // Never keep stock reserved for an order that was not written.
      await releaseStock(products, draft.requested);
      throw e;
    }

    // Mail is best-effort and must not delay or fail the order response.
    const outcome = await notifyNewOrder(order);
    await orders.updateOne({ ref: order.ref }, { $set: { emails: outcome } });

    res.status(201).json({
      ...order,
      _id: undefined,
      emails: outcome,
      receiptEmailed: outcome.customerConfirmation?.sent === true,
    });
  } catch (e) {
    next(e);
  }
});

async function notifyNewOrder(order) {
  const manager = managerAlertTemplate(order);
  const managerResult = await sendMail({
    to: process.env.ORDERS_EMAIL_TO || process.env.SMTP_USER,
    replyTo: order.customer.email || undefined,
    ...manager,
  });

  let customerResult = { sent: false, skipped: 'Customer did not provide an email address' };
  if (order.customer.email) {
    customerResult = await sendMail({ to: order.customer.email, ...customerConfirmationTemplate(order) });
  }

  return { managerAlert: managerResult, customerConfirmation: customerResult };
}

/** GET /api/orders — admin list with filters, search and pagination. */
ordersRouter.get('/', requireAdmin, async (req, res, next) => {
  try {
    const orders = await ordersCollection();

    const filter = {};
    if (req.query.status && STATUS_FLOW.includes(req.query.status)) filter.status = req.query.status;

    const q = String(req.query.q ?? '').trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ ref: rx }, { 'customer.name': rx }, { 'customer.phone': rx }, { 'customer.email': rx }];
    }

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const page = Math.max(1, Number(req.query.page) || 1);

    const [{ items, total, counts, revenue }] = await orders
      .aggregate([
        {
          $facet: {
            items: [
              { $match: filter },
              { $sort: { createdAt: -1 } },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              { $project: PROJECTION },
            ],
            total: [{ $match: filter }, { $count: 'value' }],
            // Board counts ignore the current filter so the tabs never move.
            counts: [{ $group: { _id: '$status', n: { $sum: 1 } } }, { $project: { _id: 0, status: '$_id', n: 1 } }],
            revenue: [
              { $match: { status: { $ne: 'cancelled' } } },
              { $group: { _id: null, open: { $sum: '$total' }, orders: { $sum: 1 }, units: { $sum: '$itemCount' } } },
              { $project: { _id: 0 } },
            ],
          },
        },
      ])
      .toArray();

    res.json({
      items,
      page,
      limit,
      total: total[0]?.value ?? 0,
      pages: Math.max(1, Math.ceil((total[0]?.value ?? 0) / limit)),
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      totals: revenue[0] ?? { open: 0, orders: 0, units: 0 },
      mailer: mailerStatus(),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/orders/:ref — admin detail, or the customer's own receipt by reference. */
ordersRouter.get('/:ref', async (req, res, next) => {
  try {
    const orders = await ordersCollection();
    const order = await orders.findOne({ ref: req.params.ref.toUpperCase() }, { projection: PROJECTION });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (req.user?.role === 'admin') return res.json(order);

    // A reference alone is enough to see a receipt, but not the internal trail.
    const { contactLog, emails, statusHistory, userId, ...publicOrder } = order;
    res.json({
      ...publicOrder,
      statusHistory: statusHistory.map(({ status, at }) => ({ status, at })),
      // So the receipt only promises an email that actually went out.
      receiptEmailed: emails?.customerConfirmation?.sent === true,
    });
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/orders/:ref/status — admin moves the order along the flow. */
ordersRouter.patch('/:ref/status', requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body?.status ?? '');
    if (!STATUS_FLOW.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUS_FLOW.join(', ')}` });
    }

    const note = String(req.body?.note ?? '').trim().slice(0, 500);
    const notify = req.body?.notify !== false;

    const orders = await ordersCollection();
    const order = await orders.findOne({ ref: req.params.ref.toUpperCase() });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === status) return res.status(409).json({ error: `Order is already ${status}.` });

    // Cancelling an order that still holds stock puts every unit back.
    if (status === 'cancelled' && HOLDS_STOCK.has(order.status)) {
      const products = await productsCollection();
      await releaseStock(products, order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
    }

    const now = new Date();
    const update = {
      status,
      updatedAt: now,
      ...(status === 'delivered' && { paymentStatus: 'paid', paidAt: now }),
      ...(status === 'cancelled' && { paymentStatus: 'cancelled' }),
    };

    const updated = await orders.findOneAndUpdate(
      { ref: order.ref },
      {
        $set: update,
        $push: { statusHistory: { status, at: now, by: req.user.email, note: note || null } },
      },
      { returnDocument: 'after', projection: PROJECTION },
    );

    if (notify && updated.customer.email) {
      const template = statusUpdateTemplate(updated, status, note);
      if (template) {
        const result = await sendMail({ to: updated.customer.email, ...template });
        await orders.updateOne({ ref: order.ref }, { $set: { [`emails.status_${status}`]: result } });
        updated.emails = { ...updated.emails, [`status_${status}`]: result };
      }
    }

    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** POST /api/orders/:ref/contact — email the customer and/or log a call. */
ordersRouter.post('/:ref/contact', requireAdmin, async (req, res, next) => {
  try {
    const channel = ['email', 'phone', 'whatsapp', 'note'].includes(req.body?.channel) ? req.body.channel : 'note';
    const message = String(req.body?.message ?? '').trim();
    const subject = String(req.body?.subject ?? '').trim().slice(0, 150);

    if (message.length < 2) return res.status(400).json({ error: 'Write what you told the customer.' });

    const orders = await ordersCollection();
    const order = await orders.findOne({ ref: req.params.ref.toUpperCase() });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let emailResult = null;
    if (channel === 'email') {
      if (!order.customer.email) return res.status(400).json({ error: 'This customer did not leave an email address.' });
      emailResult = await sendMail({ to: order.customer.email, ...manualMessageTemplate(order, subject, message) });
    }

    const entry = {
      at: new Date(),
      by: req.user.email,
      channel,
      subject: subject || null,
      message,
      ...(emailResult && { delivered: emailResult.sent, error: emailResult.error ?? null }),
    };

    const updated = await orders.findOneAndUpdate(
      { ref: order.ref },
      { $push: { contactLog: entry }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after', projection: PROJECTION },
    );

    res.status(201).json(updated);
  } catch (e) {
    next(e);
  }
});

/** GET /api/checkout/config — governorates and the live fees for the checkout form. */
export const checkoutConfig = async (_req, res, next) => {
  try {
    const settings = await getSettings();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      governorates: GOVERNORATES,
      shippingFee: settings.shippingFee,
      freeShippingOver: settings.freeShippingOver,
      codFee: settings.codFee,
      maxUnitsPerLine: settings.maxUnitsPerLine,
      acceptingOrders: settings.acceptingOrders,
      paymentMethods: [
        { id: 'cod', label: 'Cash on delivery', description: 'Pay the courier in cash when your order arrives.' },
      ],
    });
  } catch (e) {
    next(e);
  }
};
