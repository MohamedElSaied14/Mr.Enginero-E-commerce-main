import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

/**
 * Landing point for the Google redirect. The server puts the session token in
 * the URL fragment — never the query string, so it is not sent to the server or
 * written into access logs — and this component consumes it and cleans up.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="callback">
      <span class="spinner" aria-hidden="true"></span>
      <p>Signing you in…</p>
    </div>
  `,
  styles: [
    `
      .callback {
        display: grid;
        place-items: center;
        gap: 1rem;
        min-height: 60vh;
        color: var(--text-muted);
      }
      .spinner {
        width: 34px;
        height: 34px;
        border: 3px solid var(--border);
        border-top-color: var(--brand-500);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `,
  ],
})
export class AuthCallbackComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  constructor() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = params.get('token');
    const returnTo = params.get('returnTo') || '/';

    // Drop the token out of the address bar before anything else can read it.
    history.replaceState(null, '', location.pathname);

    if (!token) {
      this.toast.error('Sign-in did not complete. Please try again.');
      this.router.navigate(['/login']);
      return;
    }

    this.auth.acceptToken(token).subscribe({
      next: (user) => {
        this.toast.success(`Signed in as ${user.name}`);
        // Honour where they came from; only fall back to the dashboard when the
        // sign-in did not start anywhere in particular.
        const landing = returnTo && returnTo !== '/' ? returnTo : user.role === 'admin' ? '/dashboard' : '/';
        this.router.navigateByUrl(landing);
      },
      error: () => {
        this.toast.error('That sign-in link is no longer valid.');
        this.router.navigate(['/login']);
      },
    });
  }
}
