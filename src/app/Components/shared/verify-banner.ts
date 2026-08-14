import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

/**
 * Nudges a signed-in user whose address has not been confirmed yet. Nothing is
 * blocked on verification — it just stays visible until it is done.
 */
@Component({
  selector: 'app-verify-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div class="verify-bar" role="status">
        <span class="verify-text">
          Confirm <strong>{{ auth.currentUser()?.email }}</strong> to secure your account.
        </span>
        <button type="button" class="verify-action" [disabled]="sending()" (click)="resend()">
          {{ sending() ? 'Sending…' : 'Resend link' }}
        </button>
        <button type="button" class="verify-close" (click)="dismissed.set(true)" aria-label="Dismiss">✕</button>
      </div>
    }
  `,
  styles: [
    `
      .verify-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
        padding: 0.6rem 1rem;
        background: var(--accent-soft);
        border-bottom: 1px solid var(--border);
        font-size: 0.85rem;
        color: var(--text);
      }
      .verify-text { flex: 1; min-width: 200px; }
      .verify-action {
        border: 1px solid var(--warning);
        background: transparent;
        color: var(--warning);
        border-radius: var(--radius-pill);
        padding: 0.3rem 0.85rem;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        min-height: 32px;
      }
      .verify-action:hover:not(:disabled) { background: var(--warning); color: #fff; }
      .verify-close {
        border: 0;
        background: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 0.8rem;
        padding: 0.25rem;
      }
    `,
  ],
})
export class VerifyBannerComponent {
  auth = inject(AuthService);
  private toast = inject(ToastService);

  dismissed = signal(false);
  sending = signal(false);

  show = computed(() => {
    const user = this.auth.currentUser();
    return Boolean(user) && !user!.emailVerified && user!.provider !== 'google' && !this.dismissed();
  });

  resend(): void {
    this.sending.set(true);
    this.auth.resendVerification().subscribe({
      next: ({ sent, error }) => {
        this.sending.set(false);
        sent
          ? this.toast.success('Verification link sent — check your inbox.')
          : this.toast.error(error ?? 'Could not send the email right now.');
      },
      error: (e) => {
        this.sending.set(false);
        this.toast.error(e?.error?.error ?? 'Could not send the email right now.');
      },
    });
  }
}
