import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { IFacets, IProductQuery, ProductSort, SORT_OPTIONS } from '../../Models/iproduct';
import { ProductCardComponent } from '../product-card/product-card';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { ProductService } from '../../services/product.service';

const PAGE_SIZE = 24;
const EMPTY_FACETS: IFacets = {
  categories: [],
  brands: [],
  suppliers: [],
  cities: [],
  priceRange: { min: 0, max: 0 },
  totals: { products: 0, onSale: 0, inStock: 0 },
};

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [FormsModule, ProductCardComponent, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shop.html',
  styleUrl: './shop.css',
})
export class ShopComponent {
  private products = inject(ProductService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly sortOptions = SORT_OPTIONS;

  // ── Filter state ─────────────────────────────────────────────────────────
  searchText = signal('');
  categoryId = signal<number | null>(null);
  brands = signal<string[]>([]);
  suppliers = signal<string[]>([]);
  city = signal<string | null>(null);
  minPrice = signal<number | null>(null);
  maxPrice = signal<number | null>(null);
  inStockOnly = signal(false);
  onSaleOnly = signal(false);
  sort = signal<ProductSort>('featured');
  page = signal(1);
  filtersOpen = signal(false);

  /** Debounced mirror of `searchText` — this is what actually hits the API. */
  private debouncedSearch = signal('');
  private debounceTimer?: ReturnType<typeof setTimeout>;

  facets = toSignal(this.products.facets().pipe(catchError(() => of(EMPTY_FACETS))), {
    initialValue: EMPTY_FACETS,
  });

  // ── Results ──────────────────────────────────────────────────────────────
  items = this.products.items;
  total = this.products.total;
  totalPages = this.products.pages;
  loading = this.products.loading;
  error = this.products.error;

  skeletons = Array.from({ length: 8 });

  activeFilterCount = computed(
    () =>
      (this.categoryId() !== null ? 1 : 0) +
      this.brands().length +
      this.suppliers().length +
      (this.city() !== null ? 1 : 0) +
      (this.minPrice() !== null ? 1 : 0) +
      (this.maxPrice() !== null ? 1 : 0) +
      (this.inStockOnly() ? 1 : 0) +
      (this.onSaleOnly() ? 1 : 0) +
      (this.debouncedSearch() ? 1 : 0),
  );

  hasFilters = computed(() => this.activeFilterCount() > 0);

  rangeLabel = computed(() => {
    const total = this.total();
    if (!total) return 'No products';
    const from = (this.page() - 1) * PAGE_SIZE + 1;
    return `Showing ${from}–${Math.min(from + PAGE_SIZE - 1, total)} of ${total}`;
  });

  /** Windowed page numbers so 7 pages of buttons never become 40. */
  pageWindow = computed(() => {
    const pages = this.totalPages();
    const current = this.page();
    const start = Math.max(1, Math.min(current - 2, pages - 4));
    return Array.from({ length: Math.min(5, pages) }, (_, i) => start + i).filter((p) => p >= 1 && p <= pages);
  });

  private query = computed<IProductQuery>(() => ({
    q: this.debouncedSearch(),
    categoryId: this.categoryId(),
    brand: this.brands(),
    supplier: this.suppliers(),
    city: this.city(),
    minPrice: this.minPrice(),
    maxPrice: this.maxPrice(),
    inStock: this.inStockOnly(),
    onSale: this.onSaleOnly(),
    sort: this.sort(),
    page: this.page(),
    limit: PAGE_SIZE,
  }));

  constructor() {
    // Restore state from the URL first so the effect below fires once, already
    // holding the shared/bookmarked filters.
    this.readUrl();

    // Any filter change recomputes `query`, which reloads exactly once.
    effect(() => {
      const query = this.query();
      this.products.load(query);
      this.syncUrl(query);
    });
  }

  // ── Filter mutations ─────────────────────────────────────────────────────

  onSearchInput(value: string): void {
    this.searchText.set(value);
    clearTimeout(this.debounceTimer);
    // 300ms is long enough that typing "monitor" is one request, not seven.
    this.debounceTimer = setTimeout(() => {
      this.debouncedSearch.set(value.trim());
      this.page.set(1);
    }, 300);
  }

  selectCategory(id: number | null): void {
    this.categoryId.set(this.categoryId() === id ? null : id);
    this.page.set(1);
  }

  /** The mobile dropdown sets a category outright rather than toggling it. */
  selectCategoryFromList(value: string): void {
    this.categoryId.set(value ? Number(value) : null);
    this.page.set(1);
  }

  toggleBrand(name: string): void {
    this.brands.update((list) => (list.includes(name) ? list.filter((b) => b !== name) : [...list, name]));
    this.page.set(1);
  }

  toggleSupplier(id: string): void {
    this.suppliers.update((list) => (list.includes(id) ? list.filter((s) => s !== id) : [...list, id]));
    this.page.set(1);
  }

  selectCity(name: string | null): void {
    this.city.set(this.city() === name ? null : name);
    // A city and a specific shop are contradictory filters; the city wins.
    this.suppliers.set([]);
    this.page.set(1);
  }

  setPriceBound(bound: 'min' | 'max', value: string): void {
    const parsed = value === '' ? null : Number(value);
    (bound === 'min' ? this.minPrice : this.maxPrice).set(Number.isFinite(parsed as number) ? parsed : null);
    this.page.set(1);
  }

  toggleInStock(): void {
    this.inStockOnly.update((v) => !v);
    this.page.set(1);
  }

  toggleOnSale(): void {
    this.onSaleOnly.update((v) => !v);
    this.page.set(1);
  }

  setSort(value: string): void {
    this.sort.set(value as ProductSort);
    this.page.set(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clearFilters(): void {
    clearTimeout(this.debounceTimer);
    this.searchText.set('');
    this.debouncedSearch.set('');
    this.categoryId.set(null);
    this.brands.set([]);
    this.suppliers.set([]);
    this.city.set(null);
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.inStockOnly.set(false);
    this.onSaleOnly.set(false);
    this.sort.set('featured');
    this.page.set(1);
  }

  retry(): void {
    this.products.load(this.query());
  }

  // ── URL <-> state, so filtered views are shareable and survive a reload ──

  private readUrl(): void {
    const p = this.route.snapshot.queryParamMap;
    const num = (key: string) => (p.has(key) ? Number(p.get(key)) : null);

    if (p.get('q')) {
      this.searchText.set(p.get('q')!);
      this.debouncedSearch.set(p.get('q')!);
    }
    this.categoryId.set(num('categoryId'));
    this.brands.set(p.get('brand')?.split(',').filter(Boolean) ?? []);
    this.suppliers.set(p.get('supplier')?.split(',').filter(Boolean) ?? []);
    this.city.set(p.get('city'));
    this.minPrice.set(num('minPrice'));
    this.maxPrice.set(num('maxPrice'));
    this.inStockOnly.set(p.get('inStock') === 'true');
    this.onSaleOnly.set(p.get('onSale') === 'true');
    if (p.get('sort')) this.sort.set(p.get('sort') as ProductSort);
    this.page.set(num('page') ?? 1);
  }

  private syncUrl(query: IProductQuery): void {
    this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        q: query.q || null,
        categoryId: query.categoryId ?? null,
        brand: query.brand?.length ? query.brand.join(',') : null,
        supplier: query.supplier?.length ? query.supplier.join(',') : null,
        city: query.city ?? null,
        minPrice: query.minPrice ?? null,
        maxPrice: query.maxPrice ?? null,
        inStock: query.inStock || null,
        onSale: query.onSale || null,
        sort: query.sort === 'featured' ? null : query.sort,
        page: query.page === 1 ? null : query.page,
      },
    });
  }
}
