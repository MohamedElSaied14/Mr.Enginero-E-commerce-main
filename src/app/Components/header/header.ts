import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BRAND, whatsappHref } from '../../brand';
import { IProduct } from '../../Models/iproduct';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { ThemeService } from '../../services/theme.service';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrls: ['./header.css'],
})
export class Header {
  readonly brand = BRAND;
  readonly whatsappLink = whatsappHref('Hello Mr.Enginero, I have a question about a product.');

  auth = inject(AuthService);
  theme = inject(ThemeService);
  cart = inject(CartService);
  wishlist = inject(WishlistService);
  private products = inject(ProductService);
  private router = inject(Router);

  isScrolled = signal(false);
  menuOpen = signal(false);
  searchOpen = signal(false);
  searchQuery = signal('');
  searching = signal(false);
  results = signal<IProduct[]>([]);

  private queries = new Subject<string>();

  constructor() {
    this.queries
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < 2) {
            this.searching.set(false);
            return of(null);
          }
          this.searching.set(true);
          return this.products
            .search({ q, sort: 'featured', limit: 6 })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.searching.set(false);
        this.results.set(page?.items ?? []);
      });
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled.set(window.scrollY > 24);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeSearch();
    this.menuOpen.set(false);
  }

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleSearch(): void {
    this.searchOpen.update((v) => !v);
    if (!this.searchOpen()) this.resetSearch();
  }

  closeSearch(): void {
    this.searchOpen.set(false);
    this.resetSearch();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.queries.next(value);
  }

  /** Enter goes to the shop with the query applied, rather than a dead end. */
  submitSearch(): void {
    const q = this.searchQuery().trim();
    if (!q) return;
    this.router.navigate(['/shop'], { queryParams: { q } });
    this.closeSearch();
  }

  openProduct(product: IProduct): void {
    this.router.navigate(['/product', product.id]);
    this.closeSearch();
  }

  logout(): void {
    this.auth.logout();
    this.closeMenu();
    this.router.navigate(['/']);
  }

  private resetSearch(): void {
    this.searchQuery.set('');
    this.results.set([]);
    this.searching.set(false);
  }
}
