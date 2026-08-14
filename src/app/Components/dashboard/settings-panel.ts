import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AdminService, IStoreSettings, ISystemStatus } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.css',
})
export class SettingsPanelComponent {
  private admin = inject(AdminService);
  private toast = inject(ToastService);

  form = signal<IStoreSettings | null>(null);
  saved = signal<IStoreSettings | null>(null);
  system = signal<ISystemStatus | null>(null);
  loading = signal(true);
  saving = signal(false);

  /** Only enable Save once something actually differs from what is stored. */
  dirty = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.saved()));

  /** Anything the owner still has to configure before going live. */
  warnings = computed(() => {
    const s = this.system();
    if (!s) return [];

    const list: { text: string; fix: string }[] = [];
    if (!s.database.connected) list.push({ text: 'MongoDB is not reachable.', fix: s.database.error ?? '' });
    if (!s.mail.configured)
      list.push({
        text: 'Order emails are not being sent — they are only written to the server log.',
        fix: 'Add SMTP_USER and SMTP_PASS to .env (Gmail needs an App Password).',
      });
    if (!s.googleSignIn.configured)
      list.push({
        text: 'Google sign-in is off; the button redirects back to the login page.',
        fix: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.',
      });
    if (s.authSecretIsDefault)
      list.push({
        text: 'AUTH_SECRET is the development default — every session token is signed with it.',
        fix: 'Set a long random AUTH_SECRET in .env before deploying.',
      });
    if (!s.publicOrigin)
      list.push({
        text: 'PUBLIC_ORIGIN is unset, so verification links point at localhost.',
        fix: 'Set PUBLIC_ORIGIN to your real domain.',
      });
    return list;
  });

  uptime = computed(() => {
    const s = this.system()?.uptimeSeconds ?? 0;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.admin.settings().subscribe({
      next: (res) => {
        this.form.set({ ...res.settings });
        this.saved.set({ ...res.settings });
        this.system.set(res.system);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load settings.');
      },
    });
  }

  patch<K extends keyof IStoreSettings>(key: K, value: IStoreSettings[K]): void {
    this.form.update((f) => (f ? { ...f, [key]: value } : f));
  }

  patchNumber(key: keyof IStoreSettings, raw: string): void {
    const n = Number(raw);
    if (Number.isFinite(n)) this.patch(key, n as never);
  }

  save(): void {
    const f = this.form();
    if (!f || this.saving()) return;

    this.saving.set(true);
    this.admin.saveSettings(f).subscribe({
      next: ({ settings }) => {
        this.saving.set(false);
        this.form.set({ ...settings });
        this.saved.set({ ...settings });
        this.toast.success('Settings saved — they take effect on the next order.');
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e?.error?.error ?? 'Could not save those settings.');
      },
    });
  }

  revert(): void {
    this.form.set({ ...(this.saved() as IStoreSettings) });
  }
}
