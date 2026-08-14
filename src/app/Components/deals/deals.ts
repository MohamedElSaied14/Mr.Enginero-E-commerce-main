import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IProduct } from '../../Models/iproduct';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { ProductCardComponent } from '../product-card/product-card';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-deals',
  standalone: true,
  imports: [RouterLink, ProductCardComponent, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="deals-banner">
      <div class="deals-banner-inner">
        <span class="pill pill-sale">Live prices</span>
        <h1 class="deals-headline">Deals</h1>
        <p class="deals-sub">
          {{ items().length }} products currently below their original price — up to
          <strong>{{ topDiscount() }}%</strong> off.
        </p>

        @if (totalSavings() > 0) {
          <p class="deals-savings">Total savings on this page: <strong>{{ totalSavings() | calc }}</strong></p>
        }

        <div class="countdown" role="timer" aria-label="Time left in today's deals">
          <div class="cd-box"><span class="cd-num">{{ clock().h }}</span><span class="cd-label">hrs</span></div>
          <span class="cd-sep" aria-hidden="true">:</span>
          <div class="cd-box"><span class="cd-num">{{ clock().m }}</span><span class="cd-label">min</span></div>
          <span class="cd-sep" aria-hidden="true">:</span>
          <div class="cd-box"><span class="cd-num">{{ clock().s }}</span><span class="cd-label">sec</span></div>
        </div>
      </div>
    </section>

    <div class="page">
      @if (loading()) {
        <div class="product-grid">
          @for (s of skeletons; track $index) {
            <div class="pcard">
              <div class="skeleton" style="aspect-ratio:4/3"></div>
              <div class="pcard-body">
                <div class="skeleton" style="height:14px;width:80%"></div>
                <div class="skeleton" style="height:20px;width:45%"></div>
              </div>
            </div>
          }
        </div>
      } @else if (!items().length) {
        <div class="empty-state">
          <div class="empty-state-icon">🏷️</div>
          <h2 class="h5 mt-3">No active deals right now</h2>
          <a class="btn btn-brand mt-3" routerLink="/shop">Browse the full catalogue</a>
        </div>
      } @else {
        <div class="product-grid">
          @for (product of items(); track product.id) {
            <app-product-card [product]="product" [eager]="$index < 4" />
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .deals-banner {
        padding: clamp(2.5rem, 7vw, 4.5rem) 1rem;
        text-align: center;
        background:
          radial-gradient(700px 320px at 20% 0%, rgba(209, 60, 60, 0.28), transparent 60%),
          linear-gradient(140deg, #14121f, #241a2c 60%, #120f1a);
        color: #f2eff5;
      }
      .deals-banner-inner { max-width: 720px; margin-inline: auto; }
      .deals-headline {
        font-family: var(--font-display);
        font-size: clamp(2.4rem, 8vw, 4rem);
        margin: 0.75rem 0 0.35rem;
        color: #fff;
      }
      .deals-sub { color: rgba(242, 239, 245, 0.78); margin: 0 0 0.35rem; }
      .deals-savings { color: var(--accent); font-size: 0.95rem; margin: 0 0 1.75rem; }

      .countdown { display: flex; align-items: center; justify-content: center; gap: 0.4rem; }
      .cd-box {
        min-width: 74px;
        padding: 0.6rem 0.9rem;
        border-radius: var(--radius-md);
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.16);
      }
      .cd-num { display: block; font-size: 1.75rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
      .cd-label { font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.65; }
      .cd-sep { font-size: 1.5rem; opacity: 0.4; }
    `,
  ],
})
export class DealsComponent implements OnDestroy {
  private products = inject(ProductService);

  items = signal<IProduct[]>([]);
  loading = signal(true);
  skeletons = Array.from({ length: 8 });

  private secondsLeft = signal(this.secondsUntilMidnight());
  private ticker = setInterval(() => this.secondsLeft.set(this.secondsUntilMidnight()), 1000);

  clock = computed(() => {
    const total = this.secondsLeft();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      h: pad(Math.floor(total / 3600)),
      m: pad(Math.floor((total % 3600) / 60)),
      s: pad(total % 60),
    };
  });

  topDiscount = computed(() => Math.max(0, ...this.items().map((p) => p.discount)));
  totalSavings = computed(() =>
    this.items().reduce((sum, p) => sum + (p.originalPrice - p.price), 0),
  );

  constructor() {
    this.products.search({ onSale: true, sort: 'discount', limit: 48 }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.ticker);
  }

  /** The countdown tracks a real deadline — midnight — instead of a fake number. */
  private secondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  }
}
