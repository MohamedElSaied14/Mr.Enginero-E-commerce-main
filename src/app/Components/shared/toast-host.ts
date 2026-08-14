import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast-item" [class]="'toast-' + toast.kind">
          <span class="toast-mark">{{ toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i' }}</span>
          <span class="toast-text">{{ toast.message }}</span>
          <button class="toast-close" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        position: fixed;
        inset-block-end: 1.25rem;
        inset-inline-end: 1.25rem;
        z-index: 1080;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        pointer-events: none;
      }
      .toast-item {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 0.65rem;
        min-width: 260px;
        max-width: min(90vw, 380px);
        padding: 0.7rem 0.9rem;
        border-radius: var(--radius-md);
        background: var(--surface-raised);
        color: var(--text);
        border: 1px solid var(--border);
        box-shadow: var(--shadow-lg);
        animation: toast-in 0.22s ease-out;
      }
      .toast-mark {
        display: grid;
        place-items: center;
        flex: 0 0 22px;
        height: 22px;
        border-radius: 50%;
        font-size: 0.75rem;
        font-weight: 700;
        color: #fff;
      }
      .toast-success .toast-mark { background: var(--success); }
      .toast-error .toast-mark { background: var(--danger); }
      .toast-info .toast-mark { background: var(--accent); }
      .toast-text { flex: 1; font-size: 0.875rem; line-height: 1.35; }
      .toast-close {
        border: 0;
        background: none;
        color: var(--text-muted);
        cursor: pointer;
        font-size: 0.75rem;
        padding: 0.15rem;
      }
      .toast-close:hover { color: var(--text); }

      @keyframes toast-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast-item { animation: none; }
      }
    `,
  ],
})
export class ToastHostComponent {
  toasts = inject(ToastService);
}
