import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  IOrder,
  IOrderPage,
  NEXT_STATUS,
  ORDER_STATUSES,
  OrderStatus,
} from '../../Models/iorder';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { OrderService } from '../../services/order.service';
import { ToastService } from '../../services/toast.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-orders-panel',
  standalone: true,
  imports: [FormsModule, RouterLink, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-panel.html',
  styleUrl: './orders-panel.css',
})
export class OrdersPanelComponent {
  private orders = inject(OrderService);
  private toast = inject(ToastService);

  readonly statuses = ORDER_STATUSES;

  page = signal<IOrderPage | null>(null);
  loading = signal(true);
  statusFilter = signal<OrderStatus | null>(null);
  search = signal('');
  pageNumber = signal(1);
  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Reference of the order whose detail drawer is open. */
  openRef = signal<string | null>(null);
  busyRef = signal<string | null>(null);

  // Contact composer
  contactChannel = signal<'email' | 'phone' | 'whatsapp' | 'note'>('phone');
  contactSubject = signal('');
  contactMessage = signal('');
  notifyOnStatus = signal(true);

  rows = computed(() => this.page()?.items ?? []);
  counts = computed(() => this.page()?.counts ?? {});
  totals = computed(() => this.page()?.totals ?? { open: 0, orders: 0, units: 0 });
  mailer = computed(() => this.page()?.mailer ?? null);
  totalPages = computed(() => this.page()?.pages ?? 1);

  openOrder = computed(() => this.rows().find((o) => o.ref === this.openRef()) ?? null);

  newCount = computed(() => this.counts()['pending'] ?? 0);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.orders
      .list({ status: this.statusFilter(), q: this.search(), page: this.pageNumber(), limit: PAGE_SIZE })
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('Could not load orders.');
        },
      });
  }

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.pageNumber.set(1);
      this.reload();
    }, 300);
  }

  filterStatus(status: OrderStatus | null): void {
    this.statusFilter.set(this.statusFilter() === status ? null : status);
    this.pageNumber.set(1);
    this.reload();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.pageNumber.set(page);
    this.reload();
  }

  toggleDetail(ref: string): void {
    this.openRef.set(this.openRef() === ref ? null : ref);
    this.contactMessage.set('');
    this.contactSubject.set('');
  }

  // ── Status transitions ───────────────────────────────────────────────────

  nextStatuses(order: IOrder): OrderStatus[] {
    return NEXT_STATUS[order.status] ?? [];
  }

  labelFor(status: OrderStatus): string {
    return ORDER_STATUSES.find((s) => s.value === status)?.label ?? status;
  }

  toneFor(status: OrderStatus): string {
    return ORDER_STATUSES.find((s) => s.value === status)?.tone ?? 'info';
  }

  advance(order: IOrder, status: OrderStatus): void {
    if (this.busyRef()) return;

    if (status === 'cancelled' && !confirmCancel(order)) return;

    this.busyRef.set(order.ref);
    this.orders.setStatus(order.ref, status, '', this.notifyOnStatus()).subscribe({
      next: (updated) => {
        this.busyRef.set(null);
        this.toast.success(
          status === 'cancelled'
            ? `${order.ref} cancelled — ${order.itemCount} unit(s) returned to stock.`
            : `${order.ref} marked ${this.labelFor(status).toLowerCase()}.`,
        );
        this.reportMail(updated, `status_${status}`);
        this.reload();
      },
      error: (e) => {
        this.busyRef.set(null);
        this.toast.error(e?.error?.error ?? 'Could not update the order.');
      },
    });
  }

  // ── Customer contact ─────────────────────────────────────────────────────

  telHref(order: IOrder): string {
    return `tel:+2${order.customer.phone}`;
  }

  whatsappHref(order: IOrder): string {
    const text = encodeURIComponent(
      `Hello ${order.customer.name.split(' ')[0]}, this is Mr.Enginero about your order ${order.ref}.`,
    );
    return `https://wa.me/2${order.customer.phone}?text=${text}`;
  }

  mailtoHref(order: IOrder): string {
    return `mailto:${order.customer.email}?subject=${encodeURIComponent(`About your order ${order.ref}`)}`;
  }

  logContact(order: IOrder): void {
    const message = this.contactMessage().trim();
    if (message.length < 2) {
      this.toast.error('Write what you told the customer.');
      return;
    }

    const channel = this.contactChannel();
    if (channel === 'email' && !order.customer.email) {
      this.toast.error('This customer did not leave an email address.');
      return;
    }

    this.busyRef.set(order.ref);
    this.orders.contact(order.ref, { channel, message, subject: this.contactSubject().trim() }).subscribe({
      next: (updated) => {
        this.busyRef.set(null);
        this.contactMessage.set('');
        this.contactSubject.set('');
        this.toast.success(channel === 'email' ? 'Email sent to the customer.' : 'Contact logged.');
        const last = updated.contactLog?.at(-1);
        if (channel === 'email' && last && last.delivered === false) {
          this.toast.error(`Email not delivered: ${last.error ?? 'SMTP not configured'}`);
        }
        this.reload();
      },
      error: (e) => {
        this.busyRef.set(null);
        this.toast.error(e?.error?.error ?? 'Could not save the contact note.');
      },
    });
  }

  /** Surfaces a silent mail failure instead of letting it pass unnoticed. */
  private reportMail(order: IOrder, key: string): void {
    const outcome = order.emails?.[key];
    if (outcome && outcome.sent === false && !outcome.skipped) {
      this.toast.error(`Customer email not sent: ${outcome.error ?? 'unknown error'}`);
    }
  }

  // ── Formatting ───────────────────────────────────────────────────────────

  when(value: string): string {
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  mailBadge(order: IOrder): { label: string; tone: string } {
    const manager = order.emails?.['managerAlert'];
    if (!manager) return { label: 'no mail', tone: 'muted' };
    if (manager.sent) return { label: 'alert sent', tone: 'ok' };
    return { label: 'alert not sent', tone: 'bad' };
  }
}

function confirmCancel(order: IOrder): boolean {
  return window.confirm(
    `Cancel ${order.ref}?\n\n${order.itemCount} unit(s) go back into stock and the customer is emailed. This cannot be undone.`,
  );
}
