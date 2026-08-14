import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs/operators';

import { BRAND, mailHref, telHref, whatsappHref } from '../../brand';
import { IOrder, ORDER_STATUSES, OrderStatus } from '../../Models/iorder';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [RouterLink, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-confirmation.html',
  styleUrl: './order-confirmation.css',
})
export class OrderConfirmationComponent {
  private route = inject(ActivatedRoute);
  private orders = inject(OrderService);

  readonly brand = BRAND;
  readonly telLink = telHref;
  readonly mailLink = mailHref;
  readonly whatsappLink = whatsappHref('Hello Mr.Enginero, I need help finding my order.');

  order = signal<IOrder | null>(null);
  loading = signal(true);
  notFound = signal(false);

  /** Pre-fills the chat with the order reference so the customer needn't retype it. */
  orderWhatsappLink = computed(() =>
    whatsappHref(`Hello Mr.Enginero, this is about my order ${this.order()?.ref ?? ''}.`),
  );

  /** The delivery pipeline, minus the cancelled branch. */
  readonly steps = ORDER_STATUSES.filter((s) => s.value !== 'cancelled');

  reachedIndex = computed(() => {
    const status = this.order()?.status;
    if (!status || status === 'cancelled') return -1;
    return this.steps.findIndex((s) => s.value === status);
  });

  isCancelled = computed(() => this.order()?.status === 'cancelled');

  statusLabel = computed(
    () => ORDER_STATUSES.find((s) => s.value === this.order()?.status)?.label ?? '',
  );

  placedAt = computed(() => {
    const at = this.order()?.createdAt;
    return at
      ? new Date(at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
  });

  constructor() {
    this.route.paramMap
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.notFound.set(false);
        }),
        switchMap((params) => this.orders.getByRef(params.get('ref') ?? '')),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (order) => {
          this.order.set(order);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.notFound.set(true);
        },
      });
  }

  stepReached(index: number): boolean {
    return index <= this.reachedIndex();
  }

  print(): void {
    window.print();
  }
}
