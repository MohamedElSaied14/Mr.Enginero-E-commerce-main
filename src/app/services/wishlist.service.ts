import { Injectable, computed, effect, signal } from '@angular/core';
import { IProduct } from '../Models/iproduct';

const STORAGE_KEY = 'shopzone.wishlist';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private _items = signal<IProduct[]>(this.read());

  items = this._items.asReadonly();
  count = computed(() => this._items().length);
  hasItems = computed(() => this._items().length > 0);

  constructor() {
    effect(() => this.write(this._items()));
  }

  isWishlisted(productId: number): boolean {
    return this._items().some((p) => p.id === productId);
  }

  /** Returns the state it settled on, so callers can word their toast. */
  toggle(product: IProduct): 'added' | 'removed' {
    if (this.isWishlisted(product.id)) {
      this.remove(product.id);
      return 'removed';
    }
    this.add(product);
    return 'added';
  }

  add(product: IProduct): void {
    if (!this.isWishlisted(product.id)) this._items.update((list) => [...list, product]);
  }

  remove(productId: number): void {
    this._items.update((list) => list.filter((p) => p.id !== productId));
  }

  clear(): void {
    this._items.set([]);
  }

  private read(): IProduct[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as IProduct[]) : [];
    } catch {
      return [];
    }
  }

  private write(items: IProduct[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }
}
