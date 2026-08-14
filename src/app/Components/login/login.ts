import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-wrap">
      <div class="surface-card auth-card">
        <p class="section-eyebrow">Welcome back</p>
        <h1 class="auth-title">Sign in</h1>

        @if (error()) {
          <div class="alert alert-danger py-2" role="alert">{{ error() }}</div>
        }

        <label class="auth-field">
          <span class="field-label">Email</span>
          <input
            type="email"
            class="form-control"
            autocomplete="email"
            [(ngModel)]="email"
            (keydown.enter)="submit()"
            placeholder="you@example.com"
          />
        </label>

        <label class="auth-field">
          <span class="field-label">Password</span>
          <input
            type="password"
            class="form-control"
            autocomplete="current-password"
            [(ngModel)]="password"
            (keydown.enter)="submit()"
            placeholder="••••••••"
          />
        </label>

        <button type="button" class="btn btn-brand w-100" [disabled]="busy()" (click)="submit()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>

        <p class="auth-alt">No account yet? <a routerLink="/register">Create one</a></p>

        <div class="auth-divider"><span>or</span></div>

        <a class="btn btn-google" [href]="googleUrl">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"/>
            <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"/>
            <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.6z"/>
            <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.1 12.2-9.1z"/>
          </svg>
          Continue with Google
        </a>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-wrap { display: grid; place-items: center; min-height: 72vh; padding: 2rem 1rem; }
      .auth-card { width: 100%; max-width: 420px; padding: 2rem; display: flex; flex-direction: column; gap: 0.9rem; }
      .auth-title { font-family: var(--font-display); font-size: 2rem; font-weight: 500; margin: 0 0 0.5rem; }
      .auth-field { display: flex; flex-direction: column; gap: 0.3rem; }
      .field-label { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
      .auth-alt { text-align: center; font-size: 0.87rem; color: var(--text-muted); margin: 0; }

      .auth-divider { display: flex; align-items: center; gap: 0.75rem; color: var(--text-subtle); font-size: 0.78rem; }
      .auth-divider::before,
      .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }

      .btn-google {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.65rem;
        width: 100%;
        /* 44px keeps the tap target comfortable on a phone. */
        min-height: 44px;
        background: var(--surface);
        border: 1px solid var(--border-strong);
        color: var(--text);
        font-weight: 500;
        text-decoration: none;
      }
      .btn-google:hover { border-color: var(--brand-500); color: var(--text); background: var(--surface-sunken); }
    `,
  ],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** The server owns the OAuth handshake; the button is just a link into it. */
  readonly googleUrl = '/api/auth/google';

  email = '';
  password = '';
  error = signal('');
  busy = signal(false);

  submit(): void {
    if (this.busy()) return;
    if (!this.email || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }

    this.error.set('');
    this.busy.set(true);

    this.auth.login(this.email, this.password).subscribe({
      next: ({ user }) => {
        this.busy.set(false);
        this.toast.success(`Welcome back, ${user.name}`);
        this.router.navigate([user.role === 'admin' ? '/dashboard' : '/shop']);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(e?.error?.error ?? 'Could not sign you in. Please try again.');
      },
    });
  }

}
