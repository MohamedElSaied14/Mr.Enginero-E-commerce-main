import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { IProduct, IProductWrite } from '../../Models/iproduct';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { ProductService } from '../../services/product.service';
import { ToastService } from '../../services/toast.service';
import { OrdersPanelComponent } from './orders-panel';
import { SettingsPanelComponent } from './settings-panel';
import { UsersPanelComponent } from './users-panel';

type DashboardTab = 'orders' | 'catalogue' | 'users' | 'settings';

const TABS: DashboardTab[] = ['orders', 'catalogue', 'users', 'settings'];
const readTab = (value: string | null): DashboardTab =>
  TABS.includes(value as DashboardTab) ? (value as DashboardTab) : 'orders';

interface ProductForm {
  name: string;
  brand: string;
  categoryId: number;
  category: string;
  price: number | null;
  originalPrice: number | null;
  quantity: number | null;
  rating: number | null;
  reviewCount: number | null;
  imgUrl: string;
  extraImages: string;
  description: string;
  tags: string;
  isNew: boolean;
  sourceRetailer: string;
  sourceUrl: string;
  sourceNote: string;
}

const PAGE_SIZE = 20;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, CalcPipe, OrdersPanelComponent, UsersPanelComponent, SettingsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent {
  private products = inject(ProductService);
  private orders = inject(OrderService);
  private toast = inject(ToastService);
  private router = inject(Router);
  auth = inject(AuthService);

  private route = inject(ActivatedRoute);

  /** Deep-linkable: /dashboard?tab=users survives a reload and can be bookmarked. */
  tab = signal<DashboardTab>(readTab(inject(ActivatedRoute).snapshot.queryParamMap.get('tab')));
  /** Badge on the Orders tab so a new order is visible from the Catalogue view. */
  pendingOrders = signal(0);

  // ── Table state ──────────────────────────────────────────────────────────
  search = signal('');
  categoryFilter = signal<number | null>(null);
  page = signal(1);
  private searchTimer?: ReturnType<typeof setTimeout>;

  rows = this.products.items;
  total = this.products.total;
  totalPages = this.products.pages;
  loading = this.products.loading;

  categories = signal<{ id: number; name: string; count: number }[]>([]);
  stats = signal<Record<string, any> | null>(null);

  // ── Editor state ─────────────────────────────────────────────────────────
  editorOpen = signal(false);
  editingId = signal<number | null>(null);
  saving = signal(false);
  form = signal<ProductForm>(this.emptyForm());
  confirmingDelete = signal<number | null>(null);

  statCards = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return [
      { label: 'Products', value: String(s['total'] ?? 0), tone: 'brand' },
      { label: 'In stock', value: String(s['inStock'] ?? 0), tone: 'success' },
      { label: 'Out of stock', value: String(s['outOfStock'] ?? 0), tone: 'danger' },
      { label: 'On sale', value: String(s['onSale'] ?? 0), tone: 'accent' },
      {
        label: 'Inventory value',
        value: `EGP ${Math.round(s['inventoryValue'] ?? 0).toLocaleString('en-EG')}`,
        tone: 'brand',
      },
      { label: 'Avg. rating', value: (s['avgRating'] ?? 0).toFixed(2), tone: 'accent' },
    ];
  });

  /** Category rows sized against the largest one, for the mini bar chart. */
  categoryBars = computed(() => {
    const byCategory: { category: string; count: number; value: number }[] = this.stats()?.['byCategory'] ?? [];
    const max = Math.max(1, ...byCategory.map((c) => c.count));
    return byCategory.map((c) => ({ ...c, pct: Math.round((c.count / max) * 100) }));
  });

  formValid = computed(() => {
    const f = this.form();
    return f.name.trim().length > 2 && (f.price ?? 0) > 0 && f.description.trim().length > 10;
  });

  constructor() {
    // Keep the tab in the URL so a reload or a shared link lands in the same place.
    effect(() => {
      const tab = this.tab();
      this.router.navigate([], {
        relativeTo: this.route,
        replaceUrl: true,
        queryParams: { tab: tab === 'orders' ? null : tab },
      });
    });

    this.reload();
    this.products.facets().subscribe((facets) => this.categories.set(facets.categories));
    this.orders
      .list({ status: 'pending', limit: 1 })
      .subscribe({ next: (page) => this.pendingOrders.set(page.counts.pending ?? 0), error: () => {} });
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  private reload(): void {
    this.products.load({
      q: this.search().trim(),
      categoryId: this.categoryFilter(),
      sort: 'newest',
      page: this.page(),
      limit: PAGE_SIZE,
    });
    this.products.stats().subscribe((s) => this.stats.set(s));
  }

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.reload();
    }, 300);
  }

  filterCategory(id: number | null): void {
    this.categoryFilter.set(this.categoryFilter() === id ? null : id);
    this.page.set(1);
    this.reload();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.reload();
  }

  // ── Editor ───────────────────────────────────────────────────────────────

  private emptyForm(): ProductForm {
    return {
      name: '',
      brand: '',
      categoryId: 1,
      category: '',
      price: null,
      originalPrice: null,
      quantity: 0,
      rating: 4.5,
      reviewCount: 0,
      imgUrl: '',
      extraImages: '',
      description: '',
      tags: '',
      isNew: true,
      sourceRetailer: '',
      sourceUrl: '',
      sourceNote: '',
    };
  }

  patch<K extends keyof ProductForm>(key: K, value: ProductForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.set(this.emptyForm());
    this.editorOpen.set(true);
  }

  openEdit(product: IProduct): void {
    this.editingId.set(product.id);
    this.form.set({
      name: product.name,
      brand: product.brand,
      categoryId: product.categoryId,
      category: product.category,
      price: product.price,
      originalPrice: product.originalPrice,
      quantity: product.quantity,
      rating: product.rating,
      reviewCount: product.reviewCount,
      imgUrl: product.imgUrl,
      extraImages: (product.images ?? []).slice(1).join('\n'),
      description: product.description,
      tags: (product.tags ?? []).join(', '),
      isNew: product.isNew,
      sourceRetailer: product.priceSource?.retailer ?? '',
      sourceUrl: product.priceSource?.url ?? '',
      sourceNote: product.priceSource?.note ?? '',
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.editingId.set(null);
    this.form.set(this.emptyForm());
  }

  /**
   * The write payload is not a full `IProduct`: the server derives `discount`
   * and fills in the captured prices and timestamp on `priceSource`.
   */
  private toPayload(): IProductWrite {
    const f = this.form();
    const extra = f.extraImages
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      name: f.name.trim(),
      brand: f.brand.trim() || 'Generic',
      categoryId: Number(f.categoryId),
      category: this.categories().find((c) => c.id === Number(f.categoryId))?.name ?? f.category,
      price: Number(f.price) || 0,
      originalPrice: Number(f.originalPrice) || Number(f.price) || 0,
      quantity: Number(f.quantity) || 0,
      rating: Number(f.rating) || 0,
      reviewCount: Number(f.reviewCount) || 0,
      imgUrl: f.imgUrl.trim(),
      images: [f.imgUrl.trim(), ...extra].filter(Boolean),
      description: f.description.trim(),
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      isNew: f.isNew,
      // Left blank, the server keeps whatever provenance the product already had.
      priceSource:
        f.sourceRetailer.trim() || f.sourceUrl.trim()
          ? { retailer: f.sourceRetailer.trim(), url: f.sourceUrl.trim(), note: f.sourceNote.trim() }
          : undefined,
    };
  }

  /** Hostname only — the full URL is long and the table cell is narrow. */
  sourceHost(product: IProduct): string {
    const url = product.priceSource?.url;
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.slice(0, 30);
    }
  }

  capturedOn(product: IProduct): string {
    const at = product.priceSource?.capturedAt;
    return at ? new Date(at).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '';
  }

  /** Flags a price that has drifted from what was captured at the source. */
  priceDrift(product: IProduct): number {
    const captured = product.priceSource?.capturedPrice;
    return captured && captured !== product.price ? product.price - captured : 0;
  }

  save(): void {
    if (!this.formValid() || this.saving()) return;
    this.saving.set(true);

    const payload = this.toPayload();
    const id = this.editingId();
    const request = id === null ? this.products.create(payload) : this.products.update(id, payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(id === null ? 'Product added' : 'Product updated');
        this.closeEditor();
        this.reload();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e?.error?.error ?? 'Could not save the product');
      },
    });
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  askDelete(id: number): void {
    this.confirmingDelete.set(id);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(null);
  }

  confirmDelete(id: number): void {
    this.products.remove(id).subscribe({
      next: () => {
        this.confirmingDelete.set(null);
        this.toast.success('Product deleted');
        this.reload();
      },
      error: (e) => this.toast.error(e?.error?.error ?? 'Could not delete the product'),
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
