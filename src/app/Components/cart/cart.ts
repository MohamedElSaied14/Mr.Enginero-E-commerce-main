import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { CartService } from '../../services/cart.service';
import { ToastService } from '../../services/toast.service';

const FREE_SHIPPING_OVER = 5000;
const SHIPPING_FEE = 120;

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page cart">
      <header class="cart-head">
        <p class="section-eyebrow">Your basket</p>
        <h1 class="section-title">Cart</h1>
      </header>

      @if (cart.isEmpty()) {
        <div class="empty-state">
          <div class="empty-state-icon">🛒</div>
          <h2 class="h5 mt-3">Your cart is empty</h2>
          <p>Everything you add will wait for you here, even after you close the tab.</p>
          <a class="btn btn-brand mt-2" routerLink="/shop">Start shopping</a>
        </div>
      } @else {
        <div class="cart-layout">
          <section class="cart-lines surface-card">
            @for (line of cart.lines(); track line.id) {
              <article class="cart-line">
                <a [routerLink]="['/product', line.id]" class="line-thumb">
                  <img [src]="line.imgUrl" [alt]="line.name" loading="lazy" decoding="async" width="88" height="88" />
                </a>

                <div class="line-copy">
                  <a class="line-name" [routerLink]="['/product', line.id]">{{ line.name }}</a>
                  <p class="line-unit">
                    {{ line.price | calc }} each
                    @if (line.originalPrice > line.price) {
                      <span class="price-was">{{ line.originalPrice | calc }}</span>
                    }
                  </p>
                </div>

                <div class="qty-stepper" role="group" [attr.aria-label]="'Quantity for ' + line.name">
                  <button type="button" (click)="cart.setQuantity(line.id, line.quantity - 1)" aria-label="Decrease">−</button>
                  <span class="qty-value">{{ line.quantity }}</span>
                  <button
                    type="button"
                    (click)="cart.setQuantity(line.id, line.quantity + 1)"
                    [disabled]="line.quantity >= line.maxQuantity"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>

                <span class="line-total">{{ line.price * line.quantity | calc }}</span>

                <button type="button" class="line-remove" (click)="remove(line.id, line.name)" aria-label="Remove item">✕</button>
              </article>
            }

            <div class="cart-lines-footer">
              <button type="button" class="btn btn-ghost btn-sm" (click)="clear()">Empty cart</button>
              <a class="btn btn-ghost btn-sm" routerLink="/shop">Continue shopping</a>
            </div>
          </section>

          <aside class="cart-summary surface-card">
            <h2 class="summary-title">Order summary</h2>

            <dl class="summary-rows">
              <div><dt>Items ({{ cart.count() }})</dt><dd>{{ cart.subtotal() | calc }}</dd></div>
              @if (cart.savings() > 0) {
                <div class="is-saving"><dt>Discounts</dt><dd>− {{ cart.savings() | calc }}</dd></div>
              }
              <div>
                <dt>Delivery</dt>
                <dd>{{ shipping() === 0 ? 'Free' : (shipping() | calc) }}</dd>
              </div>
            </dl>

            @if (shipping() > 0) {
              <p class="summary-hint">
                Add {{ freeShippingGap() | calc }} more to qualify for free delivery.
              </p>
            }

            <div class="summary-total">
              <span>Total</span>
              <strong>{{ cart.subtotal() + shipping() | calc }}</strong>
            </div>

            <button type="button" class="btn btn-brand w-100 btn-lg" (click)="checkout()">
              Checkout · pay cash on delivery
            </button>
            <p class="summary-note">
              No card needed. You pay the courier in cash when the order arrives.
            </p>
          </aside>
        </div>
      }
    </div>
  `,
  styleUrl: './cart.css',
})
export class CartComponent {
  cart = inject(CartService);
  private toast = inject(ToastService);
  private router = inject(Router);

  shipping(): number {
    return this.cart.subtotal() >= FREE_SHIPPING_OVER || this.cart.isEmpty() ? 0 : SHIPPING_FEE;
  }

  freeShippingGap(): number {
    return Math.max(0, FREE_SHIPPING_OVER - this.cart.subtotal());
  }

  remove(id: number, name: string): void {
    this.cart.remove(id);
    this.toast.info(`${name.slice(0, 36)} removed from your cart`);
  }

  clear(): void {
    this.cart.clear();
    this.toast.info('Cart emptied');
  }

  checkout(): void {
    this.router.navigate(['/checkout']);
  }
}
