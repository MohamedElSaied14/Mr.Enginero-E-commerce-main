import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductCardComponent } from '../product-card/product-card';
import { ToastService } from '../../services/toast.service';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [RouterLink, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="wish-head">
        <p class="section-eyebrow">Saved for later</p>
        <h1 class="section-title">Wishlist</h1>
        <div class="section-divider"></div>
        <p class="wish-count">{{ wishlist.count() }} saved {{ wishlist.count() === 1 ? 'item' : 'items' }}</p>
      </header>

      @if (!wishlist.hasItems()) {
        <div class="empty-state">
          <div class="empty-state-icon">♡</div>
          <h2 class="h5 mt-3">Nothing saved yet</h2>
          <p>Tap the heart on any product and it will be waiting here next time.</p>
          <a class="btn btn-brand mt-2" routerLink="/shop">Browse products</a>
        </div>
      } @else {
        <div class="product-grid">
          @for (product of wishlist.items(); track product.id) {
            <app-product-card [product]="product" [eager]="$index < 4" />
          }
        </div>

        <div class="wish-actions">
          <button type="button" class="btn btn-ghost" (click)="clear()">Clear wishlist</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .wish-head { text-align: center; padding: 1rem 0 2rem; }
      .wish-count { margin: 0.9rem 0 0; font-size: 0.85rem; color: var(--text-muted); }
      .wish-actions { display: flex; justify-content: center; margin-top: 2.5rem; }
    `,
  ],
})
export class WishlistComponent {
  wishlist = inject(WishlistService);
  private toast = inject(ToastService);

  clear(): void {
    this.wishlist.clear();
    this.toast.info('Wishlist cleared');
  }
}
