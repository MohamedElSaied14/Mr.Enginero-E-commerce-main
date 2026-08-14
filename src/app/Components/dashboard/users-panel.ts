import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { AdminService, IManagedUser, IUserList } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { CalcPipe } from '../../pipes/calc-pipe-pipe';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-users-panel',
  standalone: true,
  imports: [CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-panel.html',
  styleUrl: './users-panel.css',
})
export class UsersPanelComponent {
  private admin = inject(AdminService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  data = signal<IUserList | null>(null);
  loading = signal(true);
  search = signal('');
  busyId = signal<number | null>(null);
  confirmingDelete = signal<number | null>(null);
  private searchTimer?: ReturnType<typeof setTimeout>;

  rows = computed(() => this.data()?.items ?? []);
  total = computed(() => this.data()?.total ?? 0);
  admins = computed(() => this.data()?.admins ?? 0);
  verified = computed(() => this.rows().filter((u) => u.emailVerified).length);
  viaGoogle = computed(() => this.rows().filter((u) => u.provider === 'google').length);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.admin.users(this.search()).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load users.');
      },
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 300);
  }

  isSelf(user: IManagedUser): boolean {
    return user.id === this.auth.currentUser()?.id;
  }

  toggleRole(user: IManagedUser): void {
    const role = user.role === 'admin' ? 'user' : 'admin';
    this.busyId.set(user.id);
    this.admin.setRole(user.id, role).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(`${user.name} is now ${role === 'admin' ? 'an admin' : 'a customer'}.`);
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(e?.error?.error ?? 'Could not change that role.');
      },
    });
  }

  verify(user: IManagedUser): void {
    this.busyId.set(user.id);
    this.admin.verifyUser(user.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(`${user.email} marked as verified.`);
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(e?.error?.error ?? 'Could not verify that address.');
      },
    });
  }

  confirmDelete(user: IManagedUser): void {
    this.admin.deleteUser(user.id).subscribe({
      next: () => {
        this.confirmingDelete.set(null);
        this.toast.success(`${user.name} removed. Their past orders are kept.`);
        this.load();
      },
      error: (e) => {
        this.confirmingDelete.set(null);
        this.toast.error(e?.error?.error ?? 'Could not remove that account.');
      },
    });
  }

  joined(value: string): string {
    return value ? new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—';
  }
}
