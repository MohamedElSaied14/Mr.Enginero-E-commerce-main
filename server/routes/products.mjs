import { Router } from 'express';
import { productsCollection } from '../db.mjs';
import { requireAdmin } from '../auth.mjs';

export const productsRouter = Router();

const PROJECTION = { _id: 0, _hasStock: 0 };

/**
 * Which shop a product was sourced from, and what it cost there, is buying
 * intelligence for the store owner — not shopper-facing content. Both fields
 * are stripped unless an admin is asking.
 */
const projectionFor = (req) =>
  req.user?.role === 'admin' ? PROJECTION : { ...PROJECTION, priceSource: 0, supplier: 0 };

const isAdmin = (req) => req.user?.role === 'admin';

const SORTS = {
  featured: { discount: -1, rating: -1, id: 1 },
  newest: { isNew: -1, id: -1 },
  'price-asc': { price: 1, id: 1 },
  'price-desc': { price: -1, id: 1 },
  rating: { rating: -1, reviewCount: -1 },
  discount: { discount: -1, price: 1 },
  name: { name: 1 },
};

/**
 * Whatever the shopper sorts by, they can't buy a sold-out item — so
 * availability is always the first sort key and their choice is the tiebreak.
 */
const withStockFirst = (sort) => ({ _hasStock: -1, ...sort });

const num = (v) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const clamp = (v, min, max, fallback) => Math.min(max, Math.max(min, num(v) ?? fallback));

/** Translates the storefront's query string into a Mongo filter document. */
function buildFilter(query, admin = false) {
  const filter = {};

  const categoryId = num(query.categoryId);
  if (categoryId) filter.categoryId = categoryId;

  if (query.brand) filter.brand = { $in: String(query.brand).split(',').filter(Boolean) };

  // Supplier filters are admin-only; a shopper cannot slice the catalogue by
  // the shop we buy from.
  if (admin && query.supplier) {
    filter['supplier.id'] = { $in: String(query.supplier).split(',').filter(Boolean) };
  }
  if (admin && query.city) filter['supplier.city'] = String(query.city);

  const [min, max] = [num(query.minPrice), num(query.maxPrice)];
  if (min !== null || max !== null) {
    filter.price = { ...(min !== null && { $gte: min }), ...(max !== null && { $lte: max }) };
  }

  if (query.inStock === 'true') filter.quantity = { $gt: 0 };
  if (query.onSale === 'true') filter.discount = { $gt: 0 };
  if (query.isNew === 'true') filter.isNew = true;

  const q = String(query.q ?? '').trim();
  if (q) {
    // Regex rather than $text: it matches partial words as the user types,
    // which is what a storefront search box is expected to do.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    // Supplier name and city are searchable too, so "CompuMarts" or
    // "Alexandria" returns that shop's products.
    filter.$or = [
      { name: rx },
      { brand: rx },
      { tags: rx },
      { description: rx },
      // Searching by supplier only makes sense — and is only allowed — for admins.
      ...(admin ? [{ 'supplier.name': rx }, { 'supplier.city': rx }] : []),
    ];
  }

  return filter;
}

/** GET /api/products — paginated, filtered, sorted list plus the facets the UI needs. */
productsRouter.get('/', async (req, res, next) => {
  try {
    const products = await productsCollection();
    const filter = buildFilter(req.query, isAdmin(req));
    const limit = clamp(req.query.limit, 1, 100, 24);
    const page = clamp(req.query.page, 1, 10_000, 1);
    const sort = SORTS[req.query.sort] ?? SORTS.featured;

    // One round-trip for the page, the count and the price range.
    const [{ items, total, range }] = await products
      .aggregate([
        { $match: filter },
        { $addFields: { _hasStock: { $gt: ['$quantity', 0] } } },
        {
          $facet: {
            items: [
              { $sort: withStockFirst(sort) },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              { $project: projectionFor(req) },
            ],
            total: [{ $count: 'value' }],
            range: [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }],
          },
        },
        {
          $project: {
            items: 1,
            total: { $ifNull: [{ $first: '$total.value' }, 0] },
            range: { $ifNull: [{ $first: '$range' }, { min: 0, max: 0 }] },
          },
        },
      ])
      .toArray();

    // Private: admin responses carry supplier data a shopper must not receive
    // from a shared cache.
    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=300');
    res.set('Vary', 'Authorization');
    res.json({
      items,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      priceRange: { min: range.min ?? 0, max: range.max ?? 0 },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/products/facets — category counts, brands and the global price range. */
productsRouter.get('/facets', async (req, res, next) => {
  try {
    const products = await productsCollection();
    const [{ categories, brands, suppliers, cities, range, totals }] = await products
      .aggregate([
        {
          $facet: {
            categories: [
              { $group: { _id: { id: '$categoryId', name: '$category' }, count: { $sum: 1 } } },
              { $project: { _id: 0, id: '$_id.id', name: '$_id.name', count: 1 } },
              { $sort: { id: 1 } },
            ],
            brands: [
              { $group: { _id: '$brand', count: { $sum: 1 } } },
              { $project: { _id: 0, name: '$_id', count: 1 } },
              { $sort: { count: -1, name: 1 } },
            ],
            suppliers: [
              {
                $group: {
                  _id: '$supplier.id',
                  name: { $first: '$supplier.name' },
                  city: { $first: '$supplier.city' },
                  area: { $first: '$supplier.area' },
                  site: { $first: '$supplier.site' },
                  count: { $sum: 1 },
                },
              },
              { $project: { _id: 0, id: '$_id', name: 1, city: 1, area: 1, site: 1, count: 1 } },
              { $sort: { city: 1, count: -1 } },
            ],
            cities: [
              { $group: { _id: '$supplier.city', count: { $sum: 1 } } },
              { $project: { _id: 0, name: '$_id', count: 1 } },
              { $sort: { count: -1 } },
            ],
            range: [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }],
            totals: [
              {
                $group: {
                  _id: null,
                  products: { $sum: 1 },
                  onSale: { $sum: { $cond: [{ $gt: ['$discount', 0] }, 1, 0] } },
                  inStock: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
                },
              },
              { $project: { _id: 0 } },
            ],
          },
        },
      ])
      .toArray();

    // Vary so a shopper never gets an admin's cached copy of the facets.
    res.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
    res.set('Vary', 'Authorization');
    res.json({
      categories,
      brands,
      // Supplier facets are sourcing data, so admins only.
      suppliers: isAdmin(req) ? suppliers : [],
      cities: isAdmin(req) ? cities : [],
      priceRange: range[0] ? { min: range[0].min, max: range[0].max } : { min: 0, max: 0 },
      totals: totals[0] ?? { products: 0, onSale: 0, inStock: 0 },
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/products/stats — dashboard KPIs. */
productsRouter.get('/stats', async (_req, res, next) => {
  try {
    const products = await productsCollection();
    const [stats] = await products
      .aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            inStock: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
            outOfStock: { $sum: { $cond: [{ $eq: ['$quantity', 0] }, 1, 0] } },
            onSale: { $sum: { $cond: [{ $gt: ['$discount', 0] }, 1, 0] } },
            newArrivals: { $sum: { $cond: ['$isNew', 1, 0] } },
            inventoryValue: { $sum: { $multiply: ['$price', '$quantity'] } },
            avgRating: { $avg: '$rating' },
            avgDiscount: { $avg: '$discount' },
          },
        },
        { $project: { _id: 0 } },
      ])
      .toArray();

    const byCategory = await products
      .aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            value: { $sum: { $multiply: ['$price', '$quantity'] } },
          },
        },
        { $project: { _id: 0, category: '$_id', count: 1, value: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    res.json({ ...(stats ?? {}), byCategory });
  } catch (e) {
    next(e);
  }
});

/** GET /api/products/:id */
productsRouter.get('/:id', async (req, res, next) => {
  try {
    const products = await productsCollection();
    const product = await products.findOne({ id: Number(req.params.id) }, { projection: projectionFor(req) });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const related = await products
      .aggregate([
        { $match: { categoryId: product.categoryId, id: { $ne: product.id } } },
        { $addFields: { _hasStock: { $gt: ['$quantity', 0] } } },
        { $sort: { _hasStock: -1, rating: -1 } },
        { $limit: 4 },
        { $project: projectionFor(req) },
      ])
      .toArray();

    res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=600');
    res.set('Vary', 'Authorization');
    res.json({ ...product, related });
  } catch (e) {
    next(e);
  }
});

const sanitise = (body) => {
  const price = Math.max(0, Number(body.price) || 0);
  const originalPrice = Math.max(price, Number(body.originalPrice) || price);
  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
  const imgUrl = body.imgUrl || images[0] || '';

  return {
    name: String(body.name ?? '').trim(),
    brand: String(body.brand ?? 'Generic').trim(),
    categoryId: Number(body.categoryId) || 1,
    category: String(body.category ?? '').trim(),
    price,
    originalPrice,
    discount: originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0,
    currency: 'EGP',
    quantity: Math.max(0, Number(body.quantity) || 0),
    rating: Math.min(5, Math.max(0, Number(body.rating) || 0)),
    reviewCount: Math.max(0, Number(body.reviewCount) || 0),
    imgUrl,
    images: images.length ? images : imgUrl ? [imgUrl] : [],
    description: String(body.description ?? '').trim(),
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    isNew: Boolean(body.isNew),
    isBought: false,
    priceSource: sanitisePriceSource(body.priceSource, price, originalPrice),
  };
};

/** Lets an admin record where they sourced a price when adding a product by hand. */
function sanitisePriceSource(source, price, originalPrice) {
  const retailer = String(source?.retailer ?? '').trim().slice(0, 120);
  const url = String(source?.url ?? '').trim().slice(0, 500);
  const note = String(source?.note ?? '').trim().slice(0, 300);

  if (!retailer && !url) return null;
  // Only http(s) — an admin-entered link is rendered as an anchor in the dashboard.
  if (url && !/^https?:\/\//i.test(url)) return null;

  return {
    retailer: retailer || new URL(url).hostname.replace(/^www\./, ''),
    url: url || null,
    capturedAt: source?.capturedAt ? new Date(source.capturedAt) : new Date(),
    capturedPrice: price,
    capturedOriginalPrice: originalPrice,
    sku: String(source?.sku ?? '').trim().slice(0, 60) || null,
    note: note || 'Entered manually from the dashboard.',
  };
}

/** POST /api/products (admin) */
productsRouter.post('/', requireAdmin, async (req, res, next) => {
  try {
    const doc = sanitise(req.body);
    if (!doc.name || !doc.price) return res.status(400).json({ error: 'name and price are required' });

    const products = await productsCollection();
    const [highest] = await products.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray();
    const product = { ...doc, id: (highest?.id ?? 0) + 1, createdAt: new Date() };

    await products.insertOne(product);
    res.status(201).json({ ...product, _id: undefined });
  } catch (e) {
    next(e);
  }
});

/** PUT /api/products/:id (admin) */
productsRouter.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const products = await productsCollection();
    const changes = { ...sanitise(req.body), updatedAt: new Date() };
    // An edit that leaves the source field blank keeps the recorded provenance
    // rather than erasing where the price originally came from.
    if (!changes.priceSource) delete changes.priceSource;

    const updated = await products.findOneAndUpdate(
      { id: Number(req.params.id) },
      { $set: changes },
      { returnDocument: 'after', projection: PROJECTION },
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** PATCH /api/products/:id/stock — used by add-to-cart to decrement safely. */
productsRouter.patch('/:id/stock', async (req, res, next) => {
  try {
    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'delta must be a non-zero number' });

    const products = await productsCollection();
    // The quantity guard makes the decrement atomic — no overselling under load.
    const updated = await products.findOneAndUpdate(
      { id: Number(req.params.id), ...(delta < 0 && { quantity: { $gte: -delta } }) },
      { $inc: { quantity: delta } },
      { returnDocument: 'after', projection: PROJECTION },
    );
    if (!updated) return res.status(409).json({ error: 'Not enough stock' });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/products/:id (admin) */
productsRouter.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const products = await productsCollection();
    const { deletedCount } = await products.deleteOne({ id: Number(req.params.id) });
    if (!deletedCount) return res.status(404).json({ error: 'Product not found' });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
