import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BRAND, mailHref, telHref, whatsappHref } from '../../brand';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page contact">
      <header class="contact-head">
        <p class="section-eyebrow">Get in touch</p>
        <h1 class="section-title">Contact us</h1>
        <div class="section-divider"></div>
        <p class="contact-sub">Build advice, order status, warranty claims — we answer within one working day.</p>
      </header>

      <div class="contact-grid">
        @if (sent()) {
          <div class="surface-card contact-card contact-sent">
            <span class="sent-mark" aria-hidden="true">✓</span>
            <h2 class="h5">Message sent</h2>
            <p>
              Thanks {{ sentName() }} — we will reply to <strong>{{ sentEmail() }}</strong> within one working day.
            </p>
            <button type="button" class="btn btn-ghost" (click)="reset()">Send another message</button>
          </div>
        } @else {
          <form class="surface-card contact-card" (ngSubmit)="submit()">
            <label class="field">
              <span class="field-label">Name</span>
              <input class="form-control" name="name" autocomplete="name" [(ngModel)]="form.name" placeholder="Your name" />
            </label>

            <label class="field">
              <span class="field-label">Email</span>
              <input
                type="email"
                class="form-control"
                name="email"
                autocomplete="email"
                [(ngModel)]="form.email"
                placeholder="you@example.com"
              />
            </label>

            <label class="field">
              <span class="field-label">What do you need?</span>
              <select class="form-select" name="topic" [(ngModel)]="form.topic">
                @for (topic of topics; track topic) {
                  <option [value]="topic">{{ topic }}</option>
                }
              </select>
            </label>

            <label class="field">
              <span class="field-label">Message</span>
              <textarea
                class="form-control"
                rows="5"
                name="message"
                [(ngModel)]="form.message"
                placeholder="Budget, the games you play, or the order number…"
              ></textarea>
            </label>

            <button type="submit" class="btn btn-brand">Send message</button>
          </form>
        }

        <aside class="contact-side">
          @for (channel of channels; track channel.label) {
            @if (channel.href) {
              <a class="surface-card channel is-link" [href]="channel.href" target="_blank" rel="noopener">
                <span class="channel-icon" aria-hidden="true">{{ channel.icon }}</span>
                <div>
                  <span class="channel-label">{{ channel.label }}</span>
                  <span class="channel-value">{{ channel.value }}</span>
                </div>
              </a>
            } @else {
              <div class="surface-card channel">
                <span class="channel-icon" aria-hidden="true">{{ channel.icon }}</span>
                <div>
                  <span class="channel-label">{{ channel.label }}</span>
                  <span class="channel-value">{{ channel.value }}</span>
                </div>
              </div>
            }
          }
          <div class="surface-card channel">
            <span class="channel-icon" aria-hidden="true">🕘</span>
            <div>
              <span class="channel-label">Opening hours</span>
              <span class="channel-value">{{ brand.hours }}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      .contact { max-width: 1000px; }
      .contact-head { text-align: center; padding: 1rem 0 2.25rem; }
      .contact-sub { margin: 0.9rem auto 0; max-width: 52ch; color: var(--text-muted); font-size: 0.9rem; }

      .contact-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
      .contact-card { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; }
      .field { display: flex; flex-direction: column; gap: 0.3rem; }
      .field-label { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }

      .contact-sent { align-items: flex-start; }
      .sent-mark {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--success);
        color: #fff;
        font-size: 1.2rem;
      }
      .contact-sent p { margin: 0; color: var(--text-muted); }

      .contact-side { display: flex; flex-direction: column; gap: 0.75rem; }
      .channel {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 1rem 1.15rem;
        color: var(--text);
        text-decoration: none;
      }
      .channel.is-link { transition: border-color var(--fast) var(--ease), transform var(--fast) var(--ease); }
      .channel.is-link:hover { border-color: var(--brand-500); transform: translateY(-2px); }
      .channel-icon { font-size: 1.25rem; }
      .channel-label {
        display: block;
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-muted);
      }
      .channel-value { display: block; font-weight: 600; font-size: 0.9rem; }

      @media (max-width: 800px) {
        .contact-grid { grid-template-columns: minmax(0, 1fr); }
      }
    `,
  ],
})
export class ContactComponent {
  private toast = inject(ToastService);

  readonly topics = ['Build advice', 'Order status', 'Warranty or return', 'Something else'];
  readonly brand = BRAND;
  readonly channels = [
    { icon: '💬', label: 'WhatsApp', value: BRAND.phone.display, href: whatsappHref('Hello Mr.Enginero,') },
    { icon: '📞', label: 'Phone', value: BRAND.phone.display, href: telHref },
    { icon: '👍', label: 'Facebook', value: BRAND.name, href: BRAND.social.facebook },
    { icon: '📧', label: 'Email', value: BRAND.email, href: mailHref },
    { icon: '📍', label: 'Based in', value: BRAND.city, href: null },
  ];

  form = { name: '', email: '', topic: this.topics[0], message: '' };

  sent = signal(false);
  sentName = signal('');
  sentEmail = signal('');

  /** Validated on submit rather than disabling the button, so the user is told why. */
  submit(): void {
    const { name, email, message } = this.form;
    if (!name.trim() || !email.includes('@') || message.trim().length < 10) {
      this.toast.error('Add your name, a valid email and a message of at least 10 characters.');
      return;
    }

    this.sentName.set(name.trim());
    this.sentEmail.set(email.trim());
    this.sent.set(true);
    this.toast.success('Message sent — we will be in touch.');
  }

  reset(): void {
    this.form = { name: '', email: '', topic: this.topics[0], message: '' };
    this.sent.set(false);
  }
}
