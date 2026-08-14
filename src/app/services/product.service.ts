import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, shareReplay, tap } from 'rxjs';

import {
  IFacets,
  IProduct,
  IProductDetail,
  IProductPage,
  IProductQuery,
  IProductWrite,
} from '../Models/iproduct';

const API = '/api/products';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  private _page = signal<IProductPage | null>(null);
  private _loading = signal(false);
  private _error = signal<string | null>(null);

  /** Current page of results for the shop grid. */
  items = computed(() => this._page()?.items ?? []);
  total = computed(() => this._page()?.total ?? 0);
  pages = computed(() => this._page()?.pages ?? 1);
  currentPage = computed(() => this._page()?.page ?? 1);
  loading = this._loading.asReadonly();
  error = this._error.asReadonly();

  /**
   * Facets rarely change, so the request is shared and replayed to every
   * subscriber instead of re-hitting the API from each component.
   */
  private facets$?: Observable<IFacets>;
  /** Detail responses keyed by product id, so back-navigation is instant. */
  private detailCache = new Map<number, IProductDetail>();

  private toParams(query: IProductQuery): HttpParams {
    let params = new HttpParams();
    const set = (key: string, value: unknown) => {
      if (value !== null && value !== undefined && value !== '' && value !== false) {
        params = params.set(key, String(value));
      }
    };

    set('q', query.q?.trim());
    set('categoryId', query.categoryId);
    set('brand', query.brand?.length ? query.brand.join(',') : null);
    set('supplier', query.supplier?.length ? query.supplier.join(',') : null);
    set('city', query.city);
    set('minPrice', query.minPrice);
    set('maxPrice', query.maxPrice);
    set('inStock', query.inStock);
    set('onSale', query.onSale);
    set('sort', query.sort);
    set('page', query.page);
    set('limit', query.limit);

    return params;
  }

  /** Loads a page into the shared signals the shop page renders from. */
  load(query: IProductQuery): void {
    this._loading.set(true);
    this._error.set(null);

    this.http.get<IProductPage>(API, { params: this.toParams(query) }).subscribe({
      next: (page) => {
        this._page.set(page);
        this._loading.set(false);
      },
      error: (e) => {
        this._error.set(this.message(e));
        this._loading.set(false);
      },
    });
  }

  /** One-off fetch that does not touch the shared signals (home page, deals, related). */
  search(query: IProductQuery): Observable<IProductPage> {
    return this.http.get<IProductPage>(API, { params: this.toParams(query) });
  }

  facets(): Observable<IFacets> {
    this.facets$ ??= this.http.get<IFacets>(`${API}/facets`).pipe(shareReplay(1));
    return this.facets$;
  }

  stats(): Observable<Record<string, any>> {
    return this.http.get<Record<string, any>>(`${API}/stats`);
  }

  getById(id: number): Observable<IProductDetail> {
    const cached = this.detailCache.get(id);
    return cached
      ? of(cached)
      : this.http
          .get<IProductDetail>(`${API}/${id}`)
          .pipe(tap((product) => this.detailCache.set(id, product)));
  }

  create(product: IProductWrite): Observable<IProduct> {
    return this.http.post<IProduct>(API, product).pipe(tap(() => this.invalidate()));
  }

  update(id: number, product: IProductWrite): Observable<IProduct> {
    return this.http.put<IProduct>(`${API}/${id}`, product).pipe(tap(() => this.invalidate()));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/${id}`).pipe(tap(() => this.invalidate()));
  }

  /** Atomically moves stock; the server refuses to go below zero. */
  adjustStock(id: number, delta: number): Observable<IProduct> {
    return this.http
      .patch<IProduct>(`${API}/${id}/stock`, { delta })
      .pipe(tap((updated) => this.patchLocal(updated)));
  }

  /** Reflects a server-side change in the already-rendered list without a refetch. */
  private patchLocal(updated: IProduct): void {
    this.detailCache.delete(updated.id);
    this._page.update((page) =>
      page ? { ...page, items: page.items.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) } : page,
    );
  }

  private invalidate(): void {
    this.facets$ = undefined;
    this.detailCache.clear();
  }

  private message(e: any): string {
    if (e?.status === 0) return 'Cannot reach the store API. Is the server running on port 3000?';
    return e?.error?.error ?? 'Could not load products. Please try again.';
  }
}
