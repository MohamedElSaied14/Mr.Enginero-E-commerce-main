import { getDb } from './db.mjs';

/**
 * Store settings that the owner can change without editing code or restarting:
 * delivery fees, the free-delivery threshold, opening hours and so on.
 *
 * Held in a single document so a read is one lookup, and cached in memory
 * because checkout reads it on every order.
 */

const DOC_ID = 'store';

export const DEFAULTS = {
  shippingFee: 120,
  freeShippingOver: 5000,
  codFee: 20,
  maxUnitsPerLine: 20,
  /** Orders stop being accepted when this is off — useful during stocktaking. */
  acceptingOrders: true,
  lowStockThreshold: 5,
  supportHours: 'Sat – Thu, 10:00 – 20:00',
};

const NUMERIC_BOUNDS = {
  shippingFee: [0, 5000],
  freeShippingOver: [0, 1_000_000],
  codFee: [0, 1000],
  maxUnitsPerLine: [1, 100],
  lowStockThreshold: [0, 100],
};

let cache = null;

const collection = async () => (await getDb()).collection('settings');

export async function getSettings() {
  if (cache) return cache;

  const stored = await (await collection()).findOne({ _id: DOC_ID });
  // Defaults fill any key added since the document was written.
  cache = { ...DEFAULTS, ...(stored ?? {}) };
  delete cache._id;
  return cache;
}

/** Validates and persists a partial update, returning the full settings. */
export async function updateSettings(patch, by) {
  const next = {};

  for (const [key, [min, max]] of Object.entries(NUMERIC_BOUNDS)) {
    if (patch[key] === undefined) continue;
    const value = Math.round(Number(patch[key]));
    if (!Number.isFinite(value) || value < min || value > max) {
      throw Object.assign(new Error(`${key} must be a number between ${min} and ${max}.`), { status: 400 });
    }
    next[key] = value;
  }

  if (patch.acceptingOrders !== undefined) next.acceptingOrders = Boolean(patch.acceptingOrders);
  if (patch.supportHours !== undefined) next.supportHours = String(patch.supportHours).trim().slice(0, 80);

  if (!Object.keys(next).length) {
    throw Object.assign(new Error('Nothing to update.'), { status: 400 });
  }

  if (next.freeShippingOver !== undefined && next.shippingFee === undefined) {
    // No cross-field rule needed, but keep the pair coherent in the cache.
  }

  await (await collection()).updateOne(
    { _id: DOC_ID },
    { $set: { ...next, updatedAt: new Date(), updatedBy: by ?? null } },
    { upsert: true },
  );

  cache = null;
  return getSettings();
}

/** Drops the cache — used after a seed or an external write. */
export function invalidateSettings() {
  cache = null;
}
