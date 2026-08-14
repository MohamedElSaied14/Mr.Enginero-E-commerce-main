import nodemailer from 'nodemailer';

import { BRAND } from './brand.mjs';

/**
 * Email delivery for order notifications.
 *
 * If SMTP_* is configured the messages go out for real. If it is not, the
 * transport falls back to logging: an order must never fail to be recorded
 * because a mail server is unreachable. Either way the outcome is written onto
 * the order document so the dashboard can show whether a mail actually left.
 */

let transporter = null;
let mode = 'unconfigured';

const brand = {
  name: BRAND.name,
  color: '#0B62B5',
  dark: '#0d1b2a',
};

export function mailerStatus() {
  return {
    mode,
    configured: mode === 'smtp',
    managerInbox: managerInbox(),
    from: fromAddress(),
  };
}

const managerInbox = () => process.env.ORDERS_EMAIL_TO || process.env.SMTP_USER || '';
const fromAddress = () =>
  process.env.SMTP_FROM || (process.env.SMTP_USER ? `${brand.name} <${process.env.SMTP_USER}>` : `${brand.name} <no-reply@localhost>`);

function getTransport() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    mode = 'smtp';
  } else {
    // Writes the rendered message to stdout instead of sending it.
    transporter = nodemailer.createTransport({ jsonTransport: true });
    mode = 'log';
  }

  return transporter;
}

/** Verifies the SMTP credentials once at boot so misconfiguration is loud. */
export async function verifyMailer() {
  const transport = getTransport();
  if (mode !== 'smtp') {
    console.warn(
      '[mail] SMTP is not configured — order emails will be logged, not sent. Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env.',
    );
    return { ok: false, mode };
  }

  try {
    await transport.verify();
    console.log(`[mail] SMTP ready, order alerts go to ${managerInbox()}`);
    return { ok: true, mode };
  } catch (e) {
    console.error('[mail] SMTP verification failed:', e.message);
    return { ok: false, mode, error: e.message };
  }
}

/**
 * Sends a message. Never throws — returns a result the caller records on the
 * order so a mail outage is visible in the dashboard rather than silent.
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to) return { sent: false, at: new Date(), error: 'No recipient address configured' };

  try {
    const info = await getTransport().sendMail({
      from: fromAddress(),
      to,
      subject,
      html,
      text: text ?? stripTags(html),
      ...(replyTo && { replyTo }),
    });

    if (mode !== 'smtp') {
      console.log(`\n[mail:log] to=${to}\n[mail:log] subject=${subject}\n${stripTags(html).slice(0, 700)}\n`);
      return { sent: false, at: new Date(), mode, error: 'SMTP not configured — message logged only' };
    }

    return { sent: true, at: new Date(), mode, messageId: info.messageId };
  } catch (e) {
    console.error('[mail] send failed:', e.message);
    return { sent: false, at: new Date(), mode, error: e.message };
  }
}

const stripTags = (html = '') =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// ── Templates ──────────────────────────────────────────────────────────────

const egp = (n) => `EGP ${Math.round(n).toLocaleString('en-EG')}`;

const shell = (title, bodyHtml) => `
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f2f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1a20;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.07)">
    <tr><td style="background:${brand.dark};padding:22px 26px;">
      <span style="color:#fff;font-size:19px;font-weight:600;letter-spacing:.3px;">Mr<span style="color:#59A8EE">.</span>Enginero</span>
      <div style="color:rgba(255,255,255,.6);font-size:12px;margin-top:3px;">${title}</div>
    </td></tr>
    <tr><td style="padding:26px;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 26px;background:#faf9fb;border-top:1px solid #eceaef;color:#6b6674;font-size:12px;">
      ${BRAND.name} · ${BRAND.owner} · ${BRAND.city} · ${BRAND.phoneDisplay}<br>
      <a href="${BRAND.facebook}" style="color:#0B62B5;">Facebook</a> · <a href="https://wa.me/${BRAND.whatsapp}" style="color:#0B62B5;">WhatsApp</a>
    </td></tr>
  </table>
</body></html>`;

const itemsTable = (order) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0;">
  ${order.items
    .map(
      (item) => `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #eceaef;vertical-align:top;">
      <div style="font-size:14px;font-weight:600;">${escapeHtml(item.name)}</div>
      <div style="font-size:12px;color:#6b6674;">${item.quantity} × ${egp(item.unitPrice)}</div>
    </td>
    <td style="padding:10px 0;border-bottom:1px solid #eceaef;text-align:right;font-size:14px;font-weight:600;white-space:nowrap;">
      ${egp(item.lineTotal)}
    </td>
  </tr>`,
    )
    .join('')}
  <tr><td style="padding:10px 0;font-size:13px;color:#6b6674;">Subtotal</td>
      <td style="padding:10px 0;text-align:right;font-size:13px;">${egp(order.subtotal)}</td></tr>
  ${
    order.savings > 0
      ? `<tr><td style="padding:2px 0;font-size:13px;color:#1f9254;">Discounts applied</td>
          <td style="padding:2px 0;text-align:right;font-size:13px;color:#1f9254;">− ${egp(order.savings)}</td></tr>`
      : ''
  }
  <tr><td style="padding:2px 0;font-size:13px;color:#6b6674;">Delivery</td>
      <td style="padding:2px 0;text-align:right;font-size:13px;">${order.shipping === 0 ? 'Free' : egp(order.shipping)}</td></tr>
  ${
    order.codFee > 0
      ? `<tr><td style="padding:2px 0;font-size:13px;color:#6b6674;">Cash-on-delivery fee</td>
          <td style="padding:2px 0;text-align:right;font-size:13px;">${egp(order.codFee)}</td></tr>`
      : ''
  }
  <tr><td style="padding:12px 0 0;border-top:2px solid #1c1a20;font-size:16px;font-weight:700;">Pay on delivery</td>
      <td style="padding:12px 0 0;border-top:2px solid #1c1a20;text-align:right;font-size:18px;font-weight:700;">${egp(order.total)}</td></tr>
</table>`;

const addressBlock = (order) => `
<div style="background:#faf9fb;border:1px solid #eceaef;border-radius:10px;padding:14px;font-size:13px;line-height:1.7;">
  <strong>${escapeHtml(order.customer.name)}</strong><br>
  ${escapeHtml(order.customer.phone)}${order.customer.email ? ` · ${escapeHtml(order.customer.email)}` : ''}<br>
  ${escapeHtml(order.address.street)}<br>
  ${escapeHtml(order.address.city)}, ${escapeHtml(order.address.governorate)}
  ${order.address.notes ? `<br><em style="color:#6b6674;">Note: ${escapeHtml(order.address.notes)}</em>` : ''}
</div>`;

/** Goes to the store manager the moment an order lands. */
export function managerAlertTemplate(order) {
  return {
    subject: `🛒 New COD order ${order.ref} — ${egp(order.total)} — ${order.customer.name}`,
    html: shell(
      `New order · ${new Date(order.createdAt).toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })}`,
      `
      <div style="background:#fbf1f3;border-inline-start:3px solid ${brand.color};padding:12px 14px;border-radius:8px;margin-bottom:18px;">
        <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${brand.color};">Cash on delivery</div>
        <div style="font-size:24px;font-weight:700;margin-top:2px;">${egp(order.total)}</div>
        <div style="font-size:13px;color:#6b6674;">Order ${order.ref} · ${order.items.length} line(s) · ${order.itemCount} unit(s)</div>
      </div>

      <h2 style="font-size:15px;margin:0 0 6px;">Deliver to</h2>
      ${addressBlock(order)}

      <h2 style="font-size:15px;margin:20px 0 0;">Items</h2>
      ${itemsTable(order)}

      <p style="font-size:13px;color:#6b6674;margin:18px 0 0;">
        Stock has already been reserved for this order. Open the dashboard to confirm it and call the customer.
      </p>
      <p style="margin:14px 0 0;">
        <a href="tel:${encodeURIComponent(order.customer.phone)}"
           style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">
          Call ${escapeHtml(order.customer.name.split(' ')[0])}
        </a>
      </p>`,
    ),
  };
}

/** Goes to the customer as their receipt. */
export function customerConfirmationTemplate(order) {
  return {
    subject: `Your Mr.Enginero order ${order.ref} is received`,
    html: shell(
      `Order ${order.ref}`,
      `
      <p style="font-size:15px;margin:0 0 6px;">Hi ${escapeHtml(order.customer.name.split(' ')[0])},</p>
      <p style="font-size:14px;color:#4a4652;margin:0 0 18px;line-height:1.6;">
        Thanks for your order. We have reserved your items and a member of our team will call you on
        <strong>${escapeHtml(order.customer.phone)}</strong> to confirm the delivery time.
        You pay <strong>${egp(order.total)}</strong> in cash when the order arrives — nothing is charged now.
      </p>

      <h2 style="font-size:15px;margin:0 0 4px;">Your order</h2>
      ${itemsTable(order)}

      <h2 style="font-size:15px;margin:20px 0 6px;">Delivering to</h2>
      ${addressBlock(order)}

      <p style="font-size:13px;color:#6b6674;margin:18px 0 0;line-height:1.6;">
        Keep the reference <strong>${order.ref}</strong> handy if you need to reach us.
        Need to change something? Reply to this email, call ${BRAND.phoneDisplay}, or message us on <a href="https://wa.me/${BRAND.whatsapp}">WhatsApp</a>.
      </p>`,
    ),
  };
}

const STATUS_COPY = {
  confirmed: {
    subject: (o) => `Order ${o.ref} confirmed — we're preparing it`,
    line: 'We spoke to you and your order is confirmed. We are getting it ready for dispatch.',
  },
  preparing: {
    subject: (o) => `Order ${o.ref} is being prepared`,
    line: 'Your items are being picked and packed right now.',
  },
  shipped: {
    subject: (o) => `Order ${o.ref} is on its way`,
    line: 'Your order has left our warehouse. The courier will call you before arriving.',
  },
  delivered: {
    subject: (o) => `Order ${o.ref} delivered — thank you`,
    line: 'Your order has been delivered and paid. Thank you for shopping with us.',
  },
  cancelled: {
    subject: (o) => `Order ${o.ref} has been cancelled`,
    line: 'Your order has been cancelled and the items returned to stock. Nothing has been charged.',
  },
};

export function statusUpdateTemplate(order, status, note) {
  const copy = STATUS_COPY[status];
  if (!copy) return null;

  return {
    subject: copy.subject(order),
    html: shell(
      `Order ${order.ref} · ${status}`,
      `
      <p style="font-size:15px;margin:0 0 6px;">Hi ${escapeHtml(order.customer.name.split(' ')[0])},</p>
      <p style="font-size:14px;color:#4a4652;line-height:1.6;margin:0 0 16px;">${copy.line}</p>
      ${note ? `<div style="background:#faf9fb;border:1px solid #eceaef;border-radius:10px;padding:12px 14px;font-size:13px;">${escapeHtml(note)}</div>` : ''}
      ${status === 'cancelled' ? '' : `<h2 style="font-size:15px;margin:20px 0 0;">Order summary</h2>${itemsTable(order)}`}
      <p style="font-size:13px;color:#6b6674;margin:18px 0 0;">Reference ${order.ref}</p>`,
    ),
  };
}

/** Sent on registration so the address is proven before it is trusted. */
export function verificationTemplate(user, token) {
  const base = process.env.PUBLIC_ORIGIN || `http://localhost:${process.env.API_PORT || 3000}`;
  const link = `${base}/api/auth/verify?token=${encodeURIComponent(token)}`;

  return {
    subject: `Confirm your email for ${BRAND.name}`,
    html: shell(
      'Confirm your email',
      `
      <p style="font-size:15px;margin:0 0 6px;">Hi ${escapeHtml(user.name.split(' ')[0])},</p>
      <p style="font-size:14px;color:#4a4652;line-height:1.6;margin:0 0 20px;">
        Confirm this address and your ${escapeHtml(BRAND.name)} account is ready. The link is good for 24 hours.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${link}"
           style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:15px;font-weight:600;">
          Confirm my email
        </a>
      </p>
      <p style="font-size:12px;color:#6b6674;line-height:1.6;margin:0;">
        If the button does not work, paste this into your browser:<br>
        <span style="word-break:break-all;">${link}</span>
      </p>
      <p style="font-size:12px;color:#6b6674;margin:18px 0 0;">
        Did not sign up? Ignore this email and nothing happens.
      </p>`,
    ),
  };
}

/** Sent once the address is confirmed, or straight away for Google sign-ups. */
export function welcomeTemplate(user) {
  return {
    subject: `Welcome to ${BRAND.name}`,
    html: shell(
      'Your account is ready',
      `
      <p style="font-size:15px;margin:0 0 6px;">Hi ${escapeHtml(user.name.split(' ')[0])},</p>
      <p style="font-size:14px;color:#4a4652;line-height:1.6;margin:0 0 18px;">
        Your account is active. You can track orders, keep a wishlist, and check out faster —
        we pay attention to the original price on every product so you can see exactly what you save.
      </p>
      <p style="margin:0 0 18px;">
        <a href="${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}/shop"
           style="display:inline-block;background:${brand.color};color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Start shopping
        </a>
      </p>
      <p style="font-size:13px;color:#6b6674;margin:0;">
        Questions? Reply here or message us on
        <a href="https://wa.me/${BRAND.whatsapp}" style="color:${brand.color};">WhatsApp</a>.
      </p>`,
    ),
  };
}

/** Free-text message the manager types in the dashboard. */
export function manualMessageTemplate(order, subject, message) {
  return {
    subject: subject || `About your order ${order.ref}`,
    html: shell(
      `Order ${order.ref}`,
      `
      <p style="font-size:15px;margin:0 0 6px;">Hi ${escapeHtml(order.customer.name.split(' ')[0])},</p>
      <div style="font-size:14px;color:#4a4652;line-height:1.7;white-space:pre-wrap;">${escapeHtml(message)}</div>
      <p style="font-size:13px;color:#6b6674;margin:22px 0 0;">Regarding order ${order.ref} · Mr.Enginero</p>`,
    ),
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
