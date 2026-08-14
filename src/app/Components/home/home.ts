import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { IProduct } from '../../Models/iproduct';
import { ProductCardComponent } from '../product-card/product-card';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class HomeComponent {
  private products = inject(ProductService);
  private router = inject(Router);

  deals = signal<IProduct[]>([]);
  arrivals = signal<IProduct[]>([]);
  categories = signal<{ id: number; name: string; count: number }[]>([]);
  totals = signal({ products: 0, onSale: 0, inStock: 0 });
  loading = signal(true);

  readonly promises = [
    { icon: '🚚', title: 'Next-day delivery', text: 'Cairo and Giza next day, the rest of Egypt in 2–3 days.' },
    { icon: '🛡️', title: 'Genuine warranty', text: 'Every part carries its official local agent warranty.' },
    { icon: '🔧', title: 'Free build service', text: 'Buy the parts, we assemble and stress-test the rig for you.' },
    { icon: '💬', title: 'Real advice', text: 'Talk to people who build PCs, not a script.' },
  ];

  skeletons = Array.from({ length: 4 });

  /** Mobile category dropdown — jumps straight to the filtered shop. */
  goToCategory(categoryId: string): void {
    if (!categoryId) return;
    this.router.navigate(['/shop'], { queryParams: { categoryId } });
  }

  constructor() {
    forkJoin({
      deals: this.products.search({ onSale: true, inStock: true, sort: 'discount', limit: 8 }),
      arrivals: this.products.search({ inStock: true, sort: 'newest', limit: 4 }),
      facets: this.products.facets(),
    }).subscribe({
      next: ({ deals, arrivals, facets }) => {
        this.deals.set(deals.items);
        this.arrivals.set(arrivals.items);
        this.categories.set(facets.categories);
        this.totals.set(facets.totals);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
