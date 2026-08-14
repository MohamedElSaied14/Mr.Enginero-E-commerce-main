/**
 * Loads `data/products.seed.json` into MongoDB Atlas and creates the admin +
 * demo accounts. Idempotent: products are upserted by their numeric `id`, so
 * re-running refreshes prices/images without duplicating anything.
 *
 * Run:  npm run db:seed          (upsert)
 *       npm run db:seed -- --fresh   (drop the products collection first)
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { productsCollection, usersCollection, ensureIndexes, closeDb } from '../server/db.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function seedProducts(fresh) {
  const { products } = JSON.parse(await readFile(join(ROOT, 'data', 'products.seed.json'), 'utf8'));
  const collection = await productsCollection();

  if (fresh) {
    await collection.deleteMany({});
    console.log('cleared existing products');
  }

  const now = new Date();
  const result = await collection.bulkWrite(
    products.map((product) => ({
      updateOne: {
        filter: { id: product.id },
        update: { $set: { ...product, updatedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  console.log(`products: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
}

/**
 * Grants the owner's address admin rights. No demo accounts are created: the
 * owner signs in with Google (or registers with a password), and their email
 * being on ADMIN_EMAILS is what makes the account an admin.
 */
async function seedUsers() {
  const users = await usersCollection();

  const owners = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!owners.length) {
    console.warn('users: ADMIN_EMAILS is empty — nobody will be able to reach the dashboard.');
    return;
  }

  // Anyone previously made an admin who is no longer on the list loses it.
  const demoted = await users.updateMany(
    { role: 'admin', email: { $nin: owners } },
    { $set: { role: 'user' } },
  );

  const promoted = await users.updateMany({ email: { $in: owners } }, { $set: { role: 'admin' } });

  console.log(
    `users: ${owners.join(', ')} will be admin on first sign-in` +
      ` (${promoted.modifiedCount} existing promoted, ${demoted.modifiedCount} demoted)`,
  );
}

/** Clears leftover demo/test records so the database only holds real data. */
async function purgeDemoData(users) {
  const demoEmails = ['admin@store.com', 'ahmed@store.com', 'customer@example.com', 'sara@example.com'];
  const { deletedCount } = await users.deleteMany({ email: { $in: demoEmails } });
  if (deletedCount) console.log(`removed ${deletedCount} demo account(s)`);
  return deletedCount;
}

const main = async () => {
  const fresh = process.argv.includes('--fresh');
  await ensureIndexes();
  await seedProducts(fresh);
  await purgeDemoData(await usersCollection());
  await seedUsers();

  const collection = await productsCollection();
  const users = await usersCollection();
  console.log(
    `\ndone — ${await collection.countDocuments()} products, ${await users.countDocuments()} user(s) in MongoDB`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
