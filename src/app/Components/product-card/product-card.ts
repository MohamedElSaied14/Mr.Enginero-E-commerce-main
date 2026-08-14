import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IProduct } from '../../Models/iproduct';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { CartService } from '../../services/cart.service';
import { ToastService } from '../../services/toast.service';
import { WishlistService } from '../../services/wishlist.service';

/**
 * The single product tile used by the shop, home, deals and related-items
 * strips. OnPush + signal inputs mean a grid of 24 cards re-renders only the
 * ones whose data actually changed.
 */
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="pcard" [class.is-sold-out]="isSoldOut()">
      <div class="pcard-media">
        <a [routerLink]="['/product', product().id]" [attr.aria-label]="product().name">
          <img
            class="pcard-img"
            [src]="product().imgUrl"
            [alt]="product().name"
            [loading]="eager() ? 'eager' : 'lazy'"
            [attr.fetchpriority]="eager() ? 'high' : null"
            decoding="async"
            width="320"
            height="240"
          />
        </a>

        <div class="pcard-badges">
          @if (product().discount > 0) {
            <span class="pill pill-sale">−{{ product().discount }}%</span>
          }
          @if (product().isNew && !isSoldOut()) {
            <span class="pill pill-new">NEW</span>
          }
          @if (isSoldOut()) {
            <span class="pill pill-sold">SOLD OUT</span>
          } @else if (product().quantity <= 3) {
            <span class="pill pill-last">Only {{ product().quantity }} left</span>
          }
        </div>

        <button
          type="button"
          class="pcard-wish"
          [class.is-on]="isWishlisted()"
          (click)="toggleWishlist()"
          [attr.aria-pressed]="isWishlisted()"
          [attr.aria-label]="isWishlisted() ? 'Remove from wishlist' : 'Save to wishlist'"
        >
          {{ isWishlisted() ? '♥' : '♡' }}
        </button>
      </div>

      <div class="pcard-body">
        <span class="pcard-brand">{{ product().brand }}</span>

        <!-- Sourcing information: the API only sends it to an admin. -->
        @if (product().supplier; as supplier) {
          <a
            class="pcard-supplier"
            [routerLink]="['/shop']"
            [queryParams]="{ supplier: supplier.id }"
            [title]="supplier.name + ' — ' + supplier.area + ', ' + supplier.city"
          >
            <span class="supplier-pin" aria-hidden="true">📍</span>
            {{ supplier.name }} · {{ supplier.city }}
          </a>
        }

        <h3 class="pcard-name">
          <a [routerLink]="['/product', product().id]">{{ product().name }}</a>
        </h3>

        <p class="pcard-rating">
          <span class="stars" aria-hidden="true">{{ starBar() }}</span>
          <span>{{ product().rating }}</span>
          <span class="text-muted">({{ product().reviewCount }})</span>
        </p>

        <div class="pcard-prices">
          <span class="price-now">{{ product().price | calc }}</span>
          @if (product().discount > 0) {
            <span class="price-was">{{ product().originalPrice | calc }}</span>
            <span class="price-off">Save {{ savings() | calc }}</span>
          }
        </div>

        <p
          class="pcard-stock"
          [class.is-low]="!isSoldOut() && product().quantity <= 5"
          [class.is-out]="isSoldOut()"
        >
          @if (isSoldOut()) {
            Out of stock
          } @else if (inCart() > 0) {
            {{ inCart() }} in your cart · {{ product().quantity }} available
          } @else {
            {{ product().quantity }} in stock
          }
        </p>

        <div class="pcard-actions">
          <button
            type="button"
            class="btn btn-brand"
            [disabled]="isSoldOut()"
            (click)="addToCart()"
          >
            {{ isSoldOut() ? 'Unavailable' : inCart() > 0 ? 'Add another' : 'Add to cart' }}
          </button>
          <a class="btn btn-ghost" [routerLink]="['/product', product().id]">Details</a>
        </div>
      </div>
    </article>
  `,
})
export class ProductCardComponent {
  product = input.required<IProduct>();
  /** Set on above-the-fold cards so their images are not lazy-loaded. */
  eager = input(false);

  private cart = inject(CartService);
  private toast = inject(ToastService);
  private wishlist = inject(WishlistService);

  isSoldOut = computed(() => this.product().quantity <= 0);
  savings = computed(() => this.product().originalPrice - this.product().price);
  inCart = computed(() => this.cart.quantityOf(this.product().id));
  isWishlisted = computed(() => this.wishlist.isWishlisted(this.product().id));

  starBar = computed(() => {
    const filled = Math.round(this.product().rating);
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  });

  addToCart(): void {
    const product = this.product();
    if (product.quantity <= 0) return;
    this.cart.add(product);
    this.toast.success(`${product.name.slice(0, 40)} added to your cart`);
  }

  toggleWishlist(): void {
    const result = this.wishlist.toggle(this.product());
    this.toast.info(result === 'added' ? 'Saved to your wishlist' : 'Removed from your wishlist');
  }
}
