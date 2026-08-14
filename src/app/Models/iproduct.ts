export interface IProduct {
  id: number;
  name: string;
  slug?: string;
  brand: string;
  categoryId: number;
  category: string;

  /** What the customer pays today, in EGP. */
  price: number;
  /** List price before the discount. Equals `price` when the item is not on sale. */
  originalPrice: number;
  /** Percentage off, derived from the two prices above. `0` means no discount. */
  discount: number;
  currency: string;

  quantity: number;
  rating: number;
  reviewCount: number;

  imgUrl: string;
  images: string[];
  description: string;
  tags: string[];

  isNew: boolean;
  isBought?: boolean;

  /**
   * The shop this product was sourced from. Only present when an admin is
   * signed in — the API strips it from public responses.
   */
  supplier?: ISupplier;

  /**
   * Where this price was sourced from. Only present when an admin is signed in —
   * the API strips it from public responses.
   */
  priceSource?: IPriceSource;
}

export interface ISupplier {
  id: string;
  name: string;
  city: string;
  area: string;
  site: string;
}

/**
 * What the dashboard sends when creating or editing a product. The server
 * derives `discount` and stamps the captured prices and timestamp onto
 * `priceSource`, so those are not part of the write shape.
 */
export type IProductWrite = Omit<Partial<IProduct>, 'priceSource'> & {
  priceSource?: { retailer: string; url: string; note: string };
};

export interface IPriceSource {
  retailer: string;
  url: string | null;
  capturedAt: string;
  capturedPrice: number;
  capturedOriginalPrice: number;
  sku: string | null;
  note: string;
}

/** `GET /api/products/:id` adds a handful of same-category suggestions. */
export interface IProductDetail extends IProduct {
  related: IProduct[];
}

/** Shape of `GET /api/products`. */
export interface IProductPage {
  items: IProduct[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  priceRange: { min: number; max: number };
}

/** Shape of `GET /api/products/facets` — everything the filter sidebar needs. */
export interface IFacets {
  categories: { id: number; name: string; count: number }[];
  brands: { name: string; count: number }[];
  suppliers: (ISupplier & { count: number })[];
  cities: { name: string; count: number }[];
  priceRange: { min: number; max: number };
  totals: { products: number; onSale: number; inStock: number };
}

export interface IProductQuery {
  q?: string;
  categoryId?: number | null;
  brand?: string[];
  supplier?: string[];
  city?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  onSale?: boolean;
  sort?: ProductSort;
  page?: number;
  limit?: number;
}

export type ProductSort = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'rating' | 'discount' | 'name';

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name A–Z' },
];
