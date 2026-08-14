import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs/operators';

import { IProductDetail } from '../../Models/iproduct';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { ProductCardComponent } from '../product-card/product-card';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { ToastService } from '../../services/toast.service';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [RouterLink, CalcPipe, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetailsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private products = inject(ProductService);
  private cart = inject(CartService);
  private toast = inject(ToastService);
  private title = inject(Title);
  wishlist = inject(WishlistService);

  product = signal<IProductDetail | null>(null);
  loading = signal(true);
  notFound = signal(false);
  activeImage = signal(0);
  quantity = signal(1);

  gallery = computed(() => {
    const p = this.product();
    if (!p) return [];
    return p.images?.length ? p.images : [p.imgUrl];
  });

  savings = computed(() => {
    const p = this.product();
    return p ? p.originalPrice - p.price : 0;
  });

  isSoldOut = computed(() => (this.product()?.quantity ?? 0) <= 0);
  inCart = computed(() => this.cart.quantityOf(this.product()?.id ?? -1));
  maxQuantity = computed(() => Math.max(1, this.product()?.quantity ?? 1));

  starBar = computed(() => {
    const filled = Math.round(this.product()?.rating ?? 0);
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  });

  /**
   * The retailer copy arrives as one long string with `•` separating the spec
   * bullets. Split it so the page reads as prose plus a spec list.
   */
  descriptionParts = computed(() => {
    const parts = (this.product()?.description ?? '')
      .split('•')
      .map((s) => s.trim().replace(/^[.\s]+/, ''))
      .filter(Boolean);
    return { intro: parts[0] ?? '', bullets: parts.slice(1) };
  });

  constructor() {
    this.route.paramMap
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.notFound.set(false);
          this.activeImage.set(0);
          this.quantity.set(1);
        }),
        switchMap((params) => this.products.getById(Number(params.get('id')))),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (product) => {
          this.product.set(product);
          this.loading.set(false);
          this.title.setTitle(`${product.name} — Mr.Enginero`);
        },
        error: () => {
          this.loading.set(false);
          this.notFound.set(true);
          this.title.setTitle('Product not found — Mr.Enginero');
        },
      });
  }

  selectImage(index: number): void {
    this.activeImage.set(index);
  }

  changeQuantity(delta: number): void {
    this.quantity.update((q) => Math.min(this.maxQuantity(), Math.max(1, q + delta)));
  }

  addToCart(): void {
    const product = this.product();
    if (!product || this.isSoldOut()) return;
    this.cart.add(product, this.quantity());
    this.toast.success(`${this.quantity()} × ${product.name.slice(0, 36)}… added to your cart`);
  }

  toggleWishlist(): void {
    const product = this.product();
    if (!product) return;
    const result = this.wishlist.toggle(product);
    this.toast.info(result === 'added' ? 'Saved to your wishlist' : 'Removed from your wishlist');
  }

  backToShop(): void {
    this.router.navigate(['/shop']);
  }
}
