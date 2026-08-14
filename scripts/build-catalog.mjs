/**
 * Builds `data/products.seed.json` — a 150-product catalogue of real, currently
 * listed hardware, drawn from several Egyptian retailers' public storefront
 * feeds. Three of the five are Alexandria businesses (El Hamd, UpToDate,
 * CompuMarts); see `scripts/sources.mjs` for the list and the feed adapters.
 *
 * Real, straight from the retailer: name, brand, selling price, original price,
 * photography, marketing copy, availability, the supplier and its city.
 * Generated for the demo: unit stock counts, star ratings and review counts —
 * no storefront feed exposes those.
 *
 * Run:  npm run catalog:build
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCES, FEED_SOURCES, fetchAllSources } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_COUNT = 150;

/** Ordered: the first category whose pattern matches a title wins. */
const CATEGORIES = [
  // A spec list separated by pipes ("… | Ryzen 7 9700X | RTX 5070 | 32GB DDR5")
  // is always a complete machine, whatever the marketing name in front of it.
  { id: 1,  name: 'Prebuilt PCs',   slug: 'prebuilt',    quota: 8,
    match: /\b(pc build|gaming pc|workstation pc|upgrade bundle|bundle \|)\b|\|\s*(ryzen|core i|core ultra)\b/i,
    exclude: /\b(case|tower|cooler|psu|power supply|monitor)\b/i },

  // Laptops are matched before graphics cards because their titles advertise the
  // GPU inside them ("… Gaming Laptop with RTX 5050").
  { id: 2,  name: 'Laptops',        slug: 'laptops',     quota: 16,
    match: /\b(laptop|notebook|ultrabook|macbook)\b|\b(ideapad|thinkpad|thinkbook|vivobook|zenbook|expertbook|latitude|precision|elitebook|probook|inspiron|legion (pro )?\d|loq \d|rog (strix|zephyrus|flow) [a-z]?\d{2}|tuf gaming [af]\d{2}|aorus (master |x)?1[5-8][a-z]?\b|cyborg \d{2}|katana \d{2}|raider \d{2}|crosshair \d{2}|vector \d{2}|stealth \d{2}|sword \d{2}|bravo \d{2}|modern \d{2}|prestige \d{2}|thin \d{2}|nitro v|predator helios|swift \d|aspire \d|gigabyte gaming a1[5-8]|alienware \d{2})\b|-R[LPV]\d{3}W\b|-HN\d{3}W\b|\b1[3-8]I[A-Z]{2,3}\d{1,2}\b/i },

  // Before graphics cards: only an APU listing mentions both a Ryzen model and
  // Radeon graphics, and it belongs here.
  { id: 4,  name: 'Processors',     slug: 'cpu',         quota: 14,
    match: /\b(ryzen \d|core i\d|core ultra|threadripper|processor|athlon|cpu)\b/i,
    exclude: /\b(motherboard|mainboard|cooler|graphics card|geforce|laptop)\b/i },
  { id: 3,  name: 'Graphics Cards', slug: 'gpu',         quota: 18,
    match: /\b(geforce|radeon rx|graphics card|rtx \d{4}|gtx \d{4}|arc a\d{3}|vga)\b/i },

  { id: 5,  name: 'Motherboards',   slug: 'motherboard', quota: 12,
    match: /\b(motherboard|mainboard|[abhxz]\d{3}[a-z]?m?[- ]|am5 gaming platform)\b/i },
  { id: 6,  name: 'Memory & Storage', slug: 'storage',   quota: 18,
    match: /\b(ddr[45]|memory|ram|ssd|nvme|hdd|hard drive|micro ?sd|flash drive|m\.2|external drive)\b/i },
  { id: 7,  name: 'Monitors',       slug: 'monitors',    quota: 16,
    match: /\b(monitor|display|\d{2}(\.\d)?["”] |oled g\d|odyssey)\b/i },
  { id: 8,  name: 'Power Supplies', slug: 'psu',         quota: 10,
    match: /\b(power supply|psu|\d{3,4}w 80\+|80\+ (gold|bronze|platinum)|ups)\b/i },
  { id: 9,  name: 'Cases & Cooling', slug: 'cooling',    quota: 14,
    match: /\b(case|tower|cooler|aio|liquid cool|air cooler|fans?( \d-pack)?|thermal paste|radiator|fan case)\b/i },
  { id: 10, name: 'Peripherals',    slug: 'peripherals', quota: 18,
    match: /\b(mouse|keyboard|headset|headphone|mouse ?pad|gamepad|controller|webcam|microphone|speaker|joystick|wheel|shifter|mixer)\b/i },
  { id: 11, name: 'Networking',     slug: 'networking',  quota: 6,
    match: /\b(router|switch|access point|wi-?fi|network|ethernet|repeater|powerline|nvr|camera|surge protector|power strip|usb hub|dock)\b/i },
];

const stripHtml = (html = '') =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<li[^>]*>/gi, ' • ')
    .replace(/<\/(p|div|h\d|li|tr)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s*\.\s*(\.\s*)+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Retailers put their own brand into their product copy ("available in Egypt
 * through Compumarts"). Left in, a shopper searching that name would get back
 * exactly the products we source there — so the names are scrubbed out before
 * the description is stored.
 */
const RETAILER_NAMES = /\b(compu\s?marts?|el\s?yamama|elyamama|el\s?hamd|elhamd|up\s?to\s?date|uptodate|el\s?nour|elnour|sigma\s+computer)\b/gi;

function scrubRetailers(text) {
  return text
    .replace(/\b(available|sold|offered)\s+(in\s+egypt\s+)?(through|from|at|by)\s+[^.,|]{0,30}/gi, '')
    .replace(RETAILER_NAMES, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,|])/g, '$1')
    .replace(/([|,])\s*\1/g, '$1')
    .trim();
}

/** Trim to a whole sentence or bullet near `max` characters. */
function summarise(text, max = 340) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' • '));
  return (stop > max * 0.5 ? cut.slice(0, stop) : cut.slice(0, cut.lastIndexOf(' '))).trim() + '…';
}

/** Deterministic 0..1 PRNG so re-running the build produces the same catalogue. */
function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Best-effort brand from the title when the feed does not carry a vendor. */
const KNOWN_BRANDS = [
  'ASUS', 'Gigabyte', 'MSI', 'Lenovo', 'Dell', 'HP', 'Acer', 'Apple', 'Samsung', 'Intel', 'AMD',
  'NVIDIA', 'Corsair', 'Kingston', 'Crucial', 'Western Digital', 'Seagate', 'SanDisk', 'Lexar',
  'TeamGroup', 'XPG', 'ADATA', 'Redragon', 'Logitech', 'A4Tech', 'Bloody', 'Cooler Master',
  'Thermaltake', 'Thermalright', 'Antec', 'AeroCool', 'Fractal Design', 'Lian Li', 'Xigmatek',
  'BenQ', 'AOC', 'ViewSonic', 'Hikvision', 'Hiksemi', 'TP Link', 'Sapphire', 'Zotac', 'Galax',
  'PNY', 'Patriot', 'Rapoo', 'Raidmax', 'Maono', 'Razer', 'HyperX', 'Philips', 'LG',
];

function guessBrand(title, fallback) {
  // A retailer's own house label ("Compumarts Bundles") would name our supplier
  // on a public field, so fall through to the manufacturer or a neutral label.
  const usable = fallback && !RETAILER_NAMES.test(fallback) ? fallback : null;
  RETAILER_NAMES.lastIndex = 0; // the regex is global; reset before reuse

  if (usable) return usable;

  const hit = KNOWN_BRANDS.find((b) => new RegExp(`\\b${b.replace(/[-\s]/g, '[-\\s]?')}\\b`, 'i').test(title));
  return hit ?? 'Mr.Enginero Build';
}

function categorise(item) {
  const haystack = [item.title, ...(item.categoryHints ?? [])].join(' ');
  return CATEGORIES.find((c) => c.match.test(haystack) && !c.exclude?.test(haystack)) ?? null;
}

function normalise(item, source, category, id) {
  const price = item.price;
  if (!price || price < 100 || price > 500_000) return null;
  if (!item.images.length) return null;

  const description = summarise(scrubRetailers(stripHtml(item.descriptionHtml)));
  if (description.length < 60) return null;

  const originalPrice = item.originalPrice > price ? item.originalPrice : price;
  const r = seeded(id);

  return {
    id,
    name: scrubRetailers(item.title),
    brand: guessBrand(item.title, item.brand),
    categoryId: category.id,
    category: category.name,

    price,
    originalPrice,
    discount: originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0,
    currency: 'EGP',

    // Demo values — no storefront feed exposes unit counts or ratings.
    quantity: item.available ? 2 + Math.floor(r * 38) : 0,
    rating: Math.round((3.7 + seeded(id + 7) * 1.3) * 10) / 10,
    reviewCount: 4 + Math.floor(seeded(id + 13) * 240),

    imgUrl: item.images[0],
    images: item.images,
    description,
    // Tags are public and searchable, so the supplier id and city must not go
    // in here — searching a shop's name would otherwise reveal exactly which
    // products we buy from them.
    tags: [...new Set([category.slug, ...(item.brand ? [item.brand.toLowerCase()] : [])])],

    isNew: item.publishedAt ? new Date(item.publishedAt) > new Date(Date.now() - 120 * 864e5) : false,
    isBought: false,

    /** Public: which shop this product comes from, and where they are. */
    supplier: {
      id: source.id,
      name: source.retailer,
      city: source.city,
      area: source.area,
      site: source.site,
    },

    /** Admin-only: the API strips this from every public response. */
    priceSource: {
      retailer: source.retailer,
      url: item.url,
      capturedAt: new Date().toISOString(),
      capturedPrice: price,
      capturedOriginalPrice: originalPrice,
      sku: item.sku,
      note:
        originalPrice > price
          ? "Original price is the retailer's own regular/compare-at price."
          : 'Retailer lists no reduced price, so original equals selling price.',
    },
  };
}

const main = async () => {
  console.log('Fetching retailer feeds…');
  const fetched = await fetchAllSources({ maxPages: 6 });

  // Bucket every listing by source and category, discounted and in-stock first.
  const buckets = new Map();
  for (const { source, items } of fetched) {
    for (const item of items) {
      const category = categorise(item);
      if (!category) continue;
      const key = `${source.id}:${category.id}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ item, source, category });
    }
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const deal = (x) => (x.item.originalPrice > x.item.price ? 1 : 0);
      const stock = (x) => (x.item.available ? 1 : 0);
      return deal(b) - deal(a) || stock(b) - stock(a);
    });
  }

  const picked = [];
  const seenTitles = new Set();

  const take = (entry) => {
    if (picked.length >= TARGET_COUNT) return false;
    // The same GPU is listed by several shops; keep one so the grid is varied.
    const fingerprint = entry.item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 46);
    if (seenTitles.has(fingerprint)) return false;

    const product = normalise(entry.item, entry.source, entry.category, picked.length + 1);
    if (!product) return false;

    seenTitles.add(fingerprint);
    picked.push(product);
    return true;
  };

  // Fill each category from every source in turn, so no one shop dominates a
  // category and the Alexandria businesses are always represented.
  for (const category of CATEGORIES) {
    const perSource = Math.ceil(category.quota / FEED_SOURCES.length);
    for (let depth = 0; depth < perSource + 6; depth++) {
      for (const source of FEED_SOURCES) {
        const inCategory = picked.filter((p) => p.categoryId === category.id).length;
        if (inCategory >= category.quota) break;
        const entry = buckets.get(`${source.id}:${category.id}`)?.[depth];
        if (entry) take(entry);
      }
    }
  }

  // Top up to 150 from whatever is left, round-robin across every bucket.
  const leftovers = [...buckets.values()].flat();
  for (let i = 0; picked.length < TARGET_COUNT && i < leftovers.length; i++) take(leftovers[i]);

  if (picked.length < TARGET_COUNT) {
    throw new Error(`only produced ${picked.length}/${TARGET_COUNT} products`);
  }

  const byCategory = CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    count: picked.filter((p) => p.categoryId === c.id).length,
  })).sort((a, b) => a.id - b.id);

  const bySupplier = SOURCES.map((s) => ({
    id: s.id,
    name: s.retailer,
    city: s.city,
    area: s.area,
    site: s.site,
    count: picked.filter((p) => p.supplier.id === s.id).length,
  }));

  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(
    join(ROOT, 'data', 'products.seed.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), categories: byCategory, suppliers: bySupplier, products: picked },
      null,
      2,
    ),
  );

  console.log('\nBy category:');
  console.table(byCategory.map(({ name, count }) => ({ category: name, count })));
  console.log('By supplier:');
  console.table(bySupplier.map(({ name, city, count }) => ({ supplier: name, city, count })));

  const alex = picked.filter((p) => p.supplier.city === 'Alexandria').length;
  console.log(
    `\n${picked.length} products → data/products.seed.json` +
      `\n  ${alex} from Alexandria businesses (${Math.round((alex / picked.length) * 100)}%)` +
      `\n  ${picked.filter((p) => p.discount > 0).length} with a real discount off the original price` +
      `\n  price range EGP ${Math.min(...picked.map((p) => p.price)).toLocaleString()} – ${Math.max(...picked.map((p) => p.price)).toLocaleString()}`,
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
