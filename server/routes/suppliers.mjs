import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { productsCollection } from '../db.mjs';
import { requireAdmin } from '../auth.mjs';

export const suppliersRouter = Router();

// The whole directory is sourcing information — who we buy from and at what
// price. Shoppers never see it.
suppliersRouter.use(requireAdmin);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The hardware businesses we source from, with contact details. Held here
 * rather than in the products collection so a company can be listed even when
 * we carry none of its stock — Sigma publishes no machine-readable catalogue,
 * but it is still a real Alexandria shop customers ask about.
 */
const DIRECTORY = [
  {
    id: 'elhamd',
    name: 'El Hamd Computer Supplies',
    city: 'Alexandria',
    area: 'Roushdy',
    address: '1 Syria St., Deeb Mall, 5th floor, Roushdy, Alexandria',
    site: 'https://elhamd.net',
    specialities: ['Laptops', 'Used & refurbished', 'Components', 'Maintenance'],
  },
  {
    id: 'uptodate',
    name: 'UpToDate Tech',
    city: 'Alexandria',
    area: 'Smouha',
    address: '5 Adeeb Mohammed Zaiton St., shop 15, opposite Smouha Club, Alexandria',
    phone: '+201018107004',
    site: 'https://uptodate.store',
    specialities: ['Gaming builds', 'Monitors', 'High-end components'],
  },
  {
    id: 'compumarts',
    name: 'CompuMarts',
    city: 'Alexandria',
    area: 'Roushdy — Deeb Mall',
    address: 'Deeb Mall, 5th floor, Roushdy, Alexandria',
    phone: '+201070571187',
    site: 'https://www.compumarts.com',
    specialities: ['Full component range', 'Gaming gear', 'Prebuilt PCs'],
  },
  {
    id: 'sigma',
    name: 'Sigma Computer',
    city: 'Alexandria',
    area: 'Smouha',
    address: 'Smouha, Alexandria',
    site: 'https://sigma-computer.com',
    specialities: ['Components', 'Laptops', 'Custom builds'],
    // Honest about why nothing of theirs is in the catalogue.
    catalogueStatus: 'not-connected',
    catalogueNote: 'Sigma publishes no public product feed, so none of their stock is listed here yet.',
  },
  {
    id: 'elnour',
    name: 'El Nour Tech',
    city: 'Cairo',
    area: '—',
    site: 'https://elnour-tech.com',
    specialities: ['Components', 'Cooling', 'Cases'],
  },
  {
    id: 'elyamama',
    name: 'Elyamama Store',
    city: 'Cairo',
    area: '—',
    site: 'https://elyamamastore.com',
    specialities: ['Gaming gear', 'Monitors', 'Peripherals'],
  },
];

let generatedAt = null;

/** GET /api/suppliers — the company directory, with live product counts. */
suppliersRouter.get('/', async (req, res, next) => {
  try {
    const products = await productsCollection();

    const counts = await products
      .aggregate([
        {
          $group: {
            _id: '$supplier.id',
            products: { $sum: 1 },
            inStock: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
            onSale: { $sum: { $cond: [{ $gt: ['$discount', 0] }, 1, 0] } },
            cheapest: { $min: '$price' },
          },
        },
      ])
      .toArray();

    const byId = new Map(counts.map((c) => [c._id, c]));

    if (!generatedAt) {
      try {
        const seed = JSON.parse(await readFile(join(ROOT, 'data', 'products.seed.json'), 'utf8'));
        generatedAt = seed.generatedAt ?? null;
      } catch {
        generatedAt = null;
      }
    }

    let items = DIRECTORY.map((company) => {
      const stats = byId.get(company.id);
      return {
        ...company,
        catalogueStatus: company.catalogueStatus ?? (stats ? 'connected' : 'not-connected'),
        products: stats?.products ?? 0,
        inStock: stats?.inStock ?? 0,
        onSale: stats?.onSale ?? 0,
        cheapest: stats?.cheapest ?? null,
      };
    });

    const city = String(req.query.city ?? '').trim();
    if (city) items = items.filter((c) => c.city.toLowerCase() === city.toLowerCase());

    const q = String(req.query.q ?? '').trim().toLowerCase();
    if (q) {
      items = items.filter((c) =>
        [c.name, c.city, c.area, c.address, ...(c.specialities ?? [])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    // Connected shops with the most stock first; unconnected ones last.
    items.sort(
      (a, b) => b.products - a.products || a.city.localeCompare(b.city) || a.name.localeCompare(b.name),
    );

    res.set('Cache-Control', 'private, no-store');
    res.json({
      items,
      cities: [...new Set(DIRECTORY.map((c) => c.city))],
      pricesCapturedAt: generatedAt,
    });
  } catch (e) {
    next(e);
  }
});
