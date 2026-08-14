import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

export interface IUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
  picture: string | null;
  provider: 'password' | 'google';
}

interface AuthResponse {
  user: IUser;
  token: string;
  /** Registration only: says whether the verification email actually went out. */
  verificationEmailSent?: boolean;
  notice?: string;
}

const TOKEN_KEY = 'shopzone.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private _currentUser = signal<IUser | null>(null);
  private _token = signal<string | null>(null);

  currentUser = this._currentUser.asReadonly();
  isLoggedIn = computed(() => this._currentUser() !== null);
  isAdmin = computed(() => this._currentUser()?.role === 'admin');
  userName = computed(() => this._currentUser()?.name ?? '');

  constructor() {
    this._token.set(this.read());
  }

  /**
   * Re-hydrates the signed-in user from a stored token. Runs as an app
   * initializer rather than in the constructor — the auth interceptor injects
   * this service, so issuing a request from here would be circular. Bootstrap
   * waits for it so a hard refresh onto /dashboard is not bounced to /login.
   */
  restoreSession(): Promise<void> {
    if (!this._token()) return Promise.resolve();

    return new Promise((resolve) => {
      this.http.get<{ user: IUser }>('/api/auth/me').subscribe({
        next: ({ user }) => {
          this._currentUser.set(user);
          resolve();
        },
        error: () => {
          this.logout();
          resolve();
        },
      });
    });
  }

  token(): string | null {
    return this._token();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(tap((res) => this.accept(res)));
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/register', { name, email, password })
      .pipe(tap((res) => this.accept(res)));
  }

  /** Completes a Google sign-in: store the token, then confirm who it belongs to. */
  acceptToken(token: string): Observable<IUser> {
    this._token.set(token);
    this.write(token);

    return this.http.get<{ user: IUser }>('/api/auth/me').pipe(
      map(({ user }) => {
        this._currentUser.set(user);
        return user;
      }),
    );
  }

  resendVerification(): Observable<{ sent: boolean; error: string | null }> {
    return this.http.post<{ sent: boolean; error: string | null }>('/api/auth/resend-verification', {});
  }

  logout(): void {
    this._currentUser.set(null);
    this._token.set(null);
    this.write(null);
  }

  private accept({ user, token }: AuthResponse): void {
    this._currentUser.set(user);
    this._token.set(token);
    this.write(token);
  }

  private read(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private write(token: string | null): void {
    try {
      token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private browsing — the session just won't survive a reload */
    }
  }
}
