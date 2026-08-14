import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page about">
      <header class="about-head">
        <p class="section-eyebrow">Who we are</p>
        <h1 class="section-title">About Mr.Enginero</h1>
        <div class="section-divider"></div>
      </header>

      <div class="about-grid">
        <div class="about-copy">
          <h2 class="about-h2">Our story</h2>
          <p>
            We started Mr.Enginero to make good PC hardware easy to buy in Egypt — without guessing whether a
            price is fair. Every product page shows the original price next to what you pay, so the discount is
            something you can check rather than something we claim.
          </p>
          <p>
            The catalogue covers the whole build: graphics cards, processors, motherboards, memory and storage,
            monitors, power supplies, cases and cooling, peripherals and ready-to-run machines. If you buy the
            parts from us, we assemble and stress-test the rig at no extra cost.
          </p>
          <a class="btn btn-brand" routerLink="/shop">Browse the catalogue</a>
        </div>

        <dl class="about-stats">
          <div class="surface-card"><dt>Products listed</dt><dd>{{ totals().products || '150' }}</dd></div>
          <div class="surface-card"><dt>On sale today</dt><dd>{{ totals().onSale || '—' }}</dd></div>
          <div class="surface-card"><dt>Ready to ship</dt><dd>{{ totals().inStock || '—' }}</dd></div>
          <div class="surface-card"><dt>Support</dt><dd>7 days</dd></div>
        </dl>
      </div>

      <section class="values">
        @for (value of values; track value.title) {
          <div class="surface-card value-card">
            <span class="value-icon" aria-hidden="true">{{ value.icon }}</span>
            <h3 class="value-title">{{ value.title }}</h3>
            <p class="value-text">{{ value.text }}</p>
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .about { max-width: 1100px; }
      .about-head { text-align: center; padding: 1rem 0 2.5rem; }

      .about-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
        gap: 2.5rem;
        align-items: start;
      }
      .about-h2 { font-family: var(--font-display); font-size: 1.6rem; font-weight: 500; margin: 0 0 0.75rem; }
      .about-copy p { color: var(--text-muted); margin-bottom: 1rem; max-width: 65ch; }

      .about-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin: 0; }
      .about-stats > div { padding: 1.1rem; }
      .about-stats dt {
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-muted);
        font-weight: 400;
      }
      .about-stats dd { margin: 0.25rem 0 0; font-size: 1.5rem; font-weight: 700; }

      .values {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 1rem;
        margin-top: 3rem;
      }
      .value-card { padding: 1.35rem; }
      .value-icon { font-size: 1.6rem; }
      .value-title { font-size: 1rem; font-weight: 600; margin: 0.6rem 0 0.3rem; }
      .value-text { margin: 0; font-size: 0.87rem; color: var(--text-muted); }

      @media (max-width: 800px) {
        .about-grid { grid-template-columns: minmax(0, 1fr); }
      }
    `,
  ],
})
export class AboutComponent {
  private products = inject(ProductService);

  totals = signal({ products: 0, onSale: 0, inStock: 0 });

  readonly values = [
    { icon: '🔍', title: 'Prices you can verify', text: 'Original price and discount shown on every listing.' },
    { icon: '🛡️', title: 'Agent warranty', text: 'Local warranty on every part, honoured through us.' },
    { icon: '🔧', title: 'Free assembly', text: 'Buy the parts, we build and stress-test the machine.' },
    { icon: '💬', title: 'Advice from builders', text: 'The people answering you build PCs for a living.' },
  ];

  constructor() {
    this.products.facets().subscribe((facets) => this.totals.set(facets.totals));
  }
}
