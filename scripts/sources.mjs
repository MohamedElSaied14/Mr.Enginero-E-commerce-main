/**
 * The Egyptian retailers the catalogue is built from, and the adapters that
 * normalise their very different feeds into one shape.
 *
 * Two storefront platforms are covered:
 *   - Shopify   → /products.json
 *   - WooCommerce → /wp-json/wc/store/products  (prices are in minor units)
 */

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; mr-enginero-catalogue/1.0)' };

export const SOURCES = [
  {
    id: 'elhamd',
    retailer: 'El Hamd Computer Supplies',
    city: 'Alexandria',
    area: 'Roushdy',
    site: 'https://elhamd.net',
    platform: 'woocommerce',
    share: 0.22,
  },
  {
    id: 'uptodate',
    retailer: 'UpToDate Tech',
    city: 'Alexandria',
    area: 'Smouha',
    site: 'https://uptodate.store',
    platform: 'woocommerce',
    share: 0.22,
  },
  {
    id: 'compumarts',
    retailer: 'CompuMarts',
    city: 'Alexandria',
    area: 'Roushdy — Deeb Mall',
    site: 'https://www.compumarts.com',
    platform: 'shopify',
    share: 0.26,
  },
  {
    id: 'elnour',
    retailer: 'El Nour Tech',
    city: 'Cairo',
    area: '—',
    site: 'https://elnour-tech.com',
    platform: 'woocommerce',
    share: 0.15,
  },
  {
    id: 'sigma',
    retailer: 'Sigma Computer',
    city: 'Alexandria',
    area: 'Smouha',
    site: 'https://sigma-computer.com',
    // Their storefront is a client-rendered Next.js app talking to a private
    // API — there is no public products feed to read, so no prices are pulled.
    // The company still appears in the directory; set a platform here if they
    // ever publish a feed.
    platform: null,
    share: 0,
  },
  {
    id: 'elyamama',
    retailer: 'Elyamama Store',
    city: 'Cairo',
    area: '—',
    site: 'https://elyamamastore.com',
    platform: 'shopify',
    share: 0.15,
  },
];

const clean = (html = '') =>
  html
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// ── Shopify ────────────────────────────────────────────────────────────────

async function fetchShopify(source, maxPages) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const { products } = await getJson(`${source.site}/products.json?limit=250&page=${page}`);
    if (!products?.length) break;
    out.push(...products.map((p) => normaliseShopify(p, source)));
  }
  return out;
}

function normaliseShopify(raw, source) {
  const variant = raw.variants?.[0];
  const price = Math.round(Number(variant?.price ?? 0));
  const compareAt = Math.round(Number(variant?.compare_at_price ?? 0));

  return {
    externalId: `${source.id}:${raw.id}`,
    title: clean(raw.title ?? '').replace(/\s+/g, ' ').trim(),
    descriptionHtml: raw.body_html ?? '',
    brand: raw.vendor || null,
    price,
    originalPrice: compareAt > price ? compareAt : price,
    available: variant?.available !== false,
    images: (raw.images ?? []).map((i) => i.src.split('?')[0]).slice(0, 4),
    url: `${source.site}/products/${raw.handle}`,
    sku: variant?.sku || null,
    publishedAt: raw.published_at ?? raw.created_at ?? null,
    categoryHints: [],
  };
}

// ── WooCommerce ────────────────────────────────────────────────────────────

async function fetchWoo(source, maxPages) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await getJson(
      `${source.site}/wp-json/wc/store/products?per_page=100&page=${page}&orderby=popularity`,
    );
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch.map((p) => normaliseWoo(p, source)));
    if (batch.length < 100) break;
  }
  return out;
}

function normaliseWoo(raw, source) {
  // WooCommerce reports money in minor units — 1250000 with minor_unit 2 is
  // EGP 12,500, not 1.25 million.
  const unit = 10 ** (raw.prices?.currency_minor_unit ?? 2);
  const price = Math.round(Number(raw.prices?.price ?? 0) / unit);
  const regular = Math.round(Number(raw.prices?.regular_price ?? 0) / unit);

  return {
    externalId: `${source.id}:${raw.id}`,
    title: clean(raw.name ?? '').replace(/\s+/g, ' ').trim(),
    descriptionHtml: raw.description || raw.short_description || '',
    brand: null,
    price,
    originalPrice: regular > price ? regular : price,
    available: raw.is_in_stock !== false,
    images: (raw.images ?? []).map((i) => i.src.split('?')[0]).slice(0, 4),
    url: raw.permalink ?? source.site,
    sku: raw.sku || null,
    publishedAt: null,
    // Woo exposes real category names, which help the classifier.
    categoryHints: (raw.categories ?? []).map((c) => c.name),
  };
}

// ── Public ─────────────────────────────────────────────────────────────────

/** Sources we can actually read a catalogue from. */
export const FEED_SOURCES = SOURCES.filter((s) => s.platform);

/** Pulls every source in parallel; a source that fails is reported, not fatal. */
export async function fetchAllSources({ maxPages = 6 } = {}) {
  const results = await Promise.all(
    FEED_SOURCES.map(async (source) => {
      try {
        const items =
          source.platform === 'shopify'
            ? await fetchShopify(source, maxPages)
            : await fetchWoo(source, maxPages);
        return { source, items, error: null };
      } catch (e) {
        return { source, items: [], error: e.message };
      }
    }),
  );

  for (const { source, items, error } of results) {
    console.log(
      `  ${source.retailer.padEnd(28)} ${source.city.padEnd(11)} ` +
        (error ? `FAILED — ${error}` : `${items.length} listings`),
    );
  }

  return results;
}
