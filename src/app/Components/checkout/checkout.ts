import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ICheckoutConfig } from '../../Models/iorder';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { ToastService } from '../../services/toast.service';

interface CheckoutForm {
  name: string;
  phone: string;
  email: string;
  governorate: string;
  city: string;
  street: string;
  notes: string;
}

/** Mirrors the server rule so the shopper is told before the round-trip. */
const PHONE_RE = /^(?:\+?20)?0?1[0125]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class CheckoutComponent {
  cart = inject(CartService);
  private orders = inject(OrderService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  config = signal<ICheckoutConfig | null>(null);
  placing = signal(false);
  serverError = signal('');
  /** Set once the shopper tries to submit, so errors don't shout while typing. */
  showErrors = signal(false);

  form = signal<CheckoutForm>({
    name: '',
    phone: '',
    email: '',
    governorate: '',
    city: '',
    street: '',
    notes: '',
  });

  shipping = computed(() => {
    const config = this.config();
    if (!config) return 0;
    return this.cart.subtotal() >= config.freeShippingOver ? 0 : config.shippingFee;
  });

  codFee = computed(() => this.config()?.codFee ?? 0);
  total = computed(() => this.cart.subtotal() + this.shipping() + this.codFee());
  freeShippingGap = computed(() =>
    Math.max(0, (this.config()?.freeShippingOver ?? 0) - this.cart.subtotal()),
  );

  errors = computed(() => {
    const f = this.form();
    return {
      name: f.name.trim().length < 3 ? 'Enter the full name of whoever receives the order.' : '',
      phone: !PHONE_RE.test(f.phone.replace(/[\s()-]/g, '')) ? 'Egyptian mobile, e.g. 01012345678.' : '',
      email: f.email && !EMAIL_RE.test(f.email.trim()) ? 'That email does not look right.' : '',
      governorate: !f.governorate ? 'Pick your governorate.' : '',
      city: f.city.trim().length < 2 ? 'Enter your city or district.' : '',
      street: f.street.trim().length < 8 ? 'Street, building and flat number, please.' : '',
    };
  });

  isValid = computed(() => Object.values(this.errors()).every((e) => !e));

  constructor() {
    this.orders.config().subscribe((config) => this.config.set(config));

    // Prefill what we already know about a signed-in shopper.
    const user = this.auth.currentUser();
    if (user) this.form.update((f) => ({ ...f, name: user.name, email: user.email }));
  }

  patch<K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    if (this.serverError()) this.serverError.set('');
  }

  place(): void {
    if (this.placing()) return;

    this.showErrors.set(true);
    if (!this.isValid()) {
      this.toast.error('Check the highlighted fields before placing the order.');
      return;
    }
    if (this.cart.isEmpty()) {
      this.toast.error('Your cart is empty.');
      return;
    }

    this.placing.set(true);
    this.serverError.set('');

    const f = this.form();
    this.orders
      .place({
        customer: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() },
        address: {
          governorate: f.governorate,
          city: f.city.trim(),
          street: f.street.trim(),
          notes: f.notes.trim(),
        },
        items: this.cart.lines().map((line) => ({ productId: line.id, quantity: line.quantity })),
      })
      .subscribe({
        next: (order) => {
          this.placing.set(false);
          // The cart only clears once the server has actually recorded the order.
          this.cart.clear();
          this.toast.success(`Order ${order.ref} placed — we will call you to confirm.`);
          this.router.navigate(['/order', order.ref]);
        },
        error: (e) => {
          this.placing.set(false);
          this.serverError.set(e?.error?.error ?? 'We could not place the order. Please try again.');
        },
      });
  }

  backToCart(): void {
    this.router.navigate(['/cart']);
  }
}
