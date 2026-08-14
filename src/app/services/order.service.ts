import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import {
  ICheckoutConfig,
  ICheckoutRequest,
  IOrder,
  IOrderPage,
  OrderStatus,
} from '../Models/iorder';

const API = '/api/orders';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private http = inject(HttpClient);

  private config$?: Observable<ICheckoutConfig>;

  /** Governorate list and delivery fees — static per deployment, so cached. */
  config(): Observable<ICheckoutConfig> {
    this.config$ ??= this.http.get<ICheckoutConfig>('/api/checkout/config').pipe(shareReplay(1));
    return this.config$;
  }

  place(order: ICheckoutRequest): Observable<IOrder> {
    return this.http.post<IOrder>(API, order);
  }

  /** Public receipt lookup by reference; admins get the full record. */
  getByRef(ref: string): Observable<IOrder> {
    return this.http.get<IOrder>(`${API}/${encodeURIComponent(ref)}`);
  }

  list(options: { status?: OrderStatus | null; q?: string; page?: number; limit?: number } = {}): Observable<IOrderPage> {
    let params = new HttpParams();
    if (options.status) params = params.set('status', options.status);
    if (options.q?.trim()) params = params.set('q', options.q.trim());
    if (options.page) params = params.set('page', String(options.page));
    if (options.limit) params = params.set('limit', String(options.limit));

    return this.http.get<IOrderPage>(API, { params });
  }

  setStatus(ref: string, status: OrderStatus, note = '', notify = true): Observable<IOrder> {
    return this.http.patch<IOrder>(`${API}/${encodeURIComponent(ref)}/status`, { status, note, notify });
  }

  contact(
    ref: string,
    payload: { channel: 'email' | 'phone' | 'whatsapp' | 'note'; message: string; subject?: string },
  ): Observable<IOrder> {
    return this.http.post<IOrder>(`${API}/${encodeURIComponent(ref)}/contact`, payload);
  }
}
