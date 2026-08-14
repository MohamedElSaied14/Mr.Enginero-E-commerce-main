import { Injectable, computed, effect, signal } from '@angular/core';
import { IProduct } from '../Models/iproduct';

export interface ICartLine {
  id: number;
  name: string;
  imgUrl: string;
  price: number;
  originalPrice: number;
  /** Stock available when the line was added — caps the quantity stepper. */
  maxQuantity: number;
  quantity: number;
}

const STORAGE_KEY = 'shopzone.cart';

/**
 * The cart used to live inside the shop component and mutated product objects
 * directly, so it reset on every navigation. It is now its own persisted store.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private _lines = signal<ICartLine[]>(this.read());

  lines = this._lines.asReadonly();
  count = computed(() => this._lines().reduce((n, l) => n + l.quantity, 0));
  distinctCount = computed(() => this._lines().length);
  subtotal = computed(() => this._lines().reduce((sum, l) => sum + l.price * l.quantity, 0));
  savings = computed(() =>
    this._lines().reduce((sum, l) => sum + (l.originalPrice - l.price) * l.quantity, 0),
  );
  isEmpty = computed(() => this._lines().length === 0);

  constructor() {
    effect(() => this.write(this._lines()));
  }

  has(productId: number): boolean {
    return this._lines().some((l) => l.id === productId);
  }

  quantityOf(productId: number): number {
    return this._lines().find((l) => l.id === productId)?.quantity ?? 0;
  }

  add(product: IProduct, quantity = 1): void {
    if (product.quantity <= 0) return;

    this._lines.update((lines) => {
      const existing = lines.find((l) => l.id === product.id);
      if (existing) {
        return lines.map((l) =>
          l.id === product.id ? { ...l, quantity: Math.min(l.maxQuantity, l.quantity + quantity) } : l,
        );
      }
      return [
        ...lines,
        {
          id: product.id,
          name: product.name,
          imgUrl: product.imgUrl,
          price: product.price,
          originalPrice: product.originalPrice,
          maxQuantity: product.quantity,
          quantity: Math.min(product.quantity, quantity),
        },
      ];
    });
  }

  setQuantity(productId: number, quantity: number): void {
    if (quantity <= 0) return this.remove(productId);
    this._lines.update((lines) =>
      lines.map((l) => (l.id === productId ? { ...l, quantity: Math.min(l.maxQuantity, quantity) } : l)),
    );
  }

  remove(productId: number): void {
    this._lines.update((lines) => lines.filter((l) => l.id !== productId));
  }

  clear(): void {
    this._lines.set([]);
  }

  private read(): ICartLine[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ICartLine[]) : [];
    } catch {
      return [];
    }
  }

  private write(lines: ICartLine[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable — the cart just stays in memory */
    }
  }
}
