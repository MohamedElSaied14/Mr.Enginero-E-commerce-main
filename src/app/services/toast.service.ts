import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface IToast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** Replaces the blocking `alert()`/`confirm()` calls scattered through the app. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private _toasts = signal<IToast[]>([]);

  toasts = this._toasts.asReadonly();

  success(message: string) { this.push('success', message); }
  error(message: string) { this.push('error', message); }
  info(message: string) { this.push('info', message); }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: ToastKind, message: string): void {
    const id = this.nextId++;
    this._toasts.update((list) => [...list.slice(-3), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), 3500);
  }
}
