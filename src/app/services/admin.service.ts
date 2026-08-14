import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface IManagedUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  provider: 'password' | 'google';
  emailVerified: boolean;
  picture: string | null;
  createdAt: string;
  /** Listed in ADMIN_EMAILS — cannot be demoted or deleted from the UI. */
  isOwner: boolean;
  orders: number;
  spent: number;
}

export interface IUserList {
  items: IManagedUser[];
  total: number;
  admins: number;
  owners: string[];
}

export interface IStoreSettings {
  shippingFee: number;
  freeShippingOver: number;
  codFee: number;
  maxUnitsPerLine: number;
  acceptingOrders: boolean;
  lowStockThreshold: number;
  supportHours: string;
}

export interface ISystemStatus {
  database: { connected: boolean; name: string | null; error: string | null };
  mail: { configured: boolean; mode: string; managerInbox: string; from: string };
  googleSignIn: { configured: boolean };
  adminEmails: string[];
  publicOrigin: string | null;
  authSecretIsDefault: boolean;
  counts: { products: number; orders: number; users: number };
  node: string;
  uptimeSeconds: number;
}

export interface ISettingsResponse {
  settings: IStoreSettings;
  defaults: IStoreSettings;
  system: ISystemStatus;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  users(q = ''): Observable<IUserList> {
    const params = q.trim() ? new HttpParams().set('q', q.trim()) : undefined;
    return this.http.get<IUserList>('/api/admin/users', { params });
  }

  setRole(id: number, role: 'admin' | 'user'): Observable<IManagedUser> {
    return this.http.patch<IManagedUser>(`/api/admin/users/${id}/role`, { role });
  }

  verifyUser(id: number): Observable<IManagedUser> {
    return this.http.patch<IManagedUser>(`/api/admin/users/${id}/verify`, {});
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`/api/admin/users/${id}`);
  }

  settings(): Observable<ISettingsResponse> {
    return this.http.get<ISettingsResponse>('/api/admin/settings');
  }

  saveSettings(patch: Partial<IStoreSettings>): Observable<{ settings: IStoreSettings }> {
    return this.http.put<{ settings: IStoreSettings }>('/api/admin/settings', patch);
  }
}
