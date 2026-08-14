import { MongoClient } from 'mongodb';

let clientPromise = null;

/**
 * One pooled MongoClient for the whole process. Reusing it is what keeps API
 * latency at query time instead of paying a TLS + auth handshake per request.
 */
export function getClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set — copy .env.example to .env');

    clientPromise = new MongoClient(uri, {
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 8000,
      retryWrites: true,
      compressors: ['zlib'],
    }).connect();
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || 'shopzone');
}

export const productsCollection = async () => (await getDb()).collection('products');
export const usersCollection = async () => (await getDb()).collection('users');
export const ordersCollection = async () => (await getDb()).collection('orders');

/** Indexes the API relies on. Safe to call on every boot — Mongo no-ops duplicates. */
export async function ensureIndexes() {
  const [products, users, orders] = [
    await productsCollection(),
    await usersCollection(),
    await ordersCollection(),
  ];
  await Promise.all([
    orders.createIndex({ ref: 1 }, { unique: true }),
    orders.createIndex({ createdAt: -1 }),
    orders.createIndex({ status: 1, createdAt: -1 }),
    orders.createIndex({ 'customer.phone': 1 }),
    orders.createIndex({ 'customer.email': 1 }),
    products.createIndex({ id: 1 }, { unique: true }),
    products.createIndex({ categoryId: 1, price: 1 }),
    products.createIndex({ price: 1 }),
    products.createIndex({ discount: -1 }),
    products.createIndex({ rating: -1 }),
    // Powers ?q= full-text search across name, brand, description and tags.
    products.createIndex(
      { name: 'text', brand: 'text', description: 'text', tags: 'text' },
      { name: 'product_search', weights: { name: 10, brand: 5, tags: 3, description: 1 } },
    ),
    users.createIndex({ email: 1 }, { unique: true }),
  ]);
}

export async function closeDb() {
  if (clientPromise) {
    const client = await clientPromise;
    clientPromise = null;
    await client.close();
  }
}
