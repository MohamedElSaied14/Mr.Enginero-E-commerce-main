import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { CalcPipe } from '../../pipes/calc-pipe-pipe';

interface ICompany {
  id: string;
  name: string;
  city: string;
  area: string;
  address?: string;
  phone?: string;
  site: string;
  specialities?: string[];
  catalogueStatus: 'connected' | 'not-connected';
  catalogueNote?: string;
  products: number;
  inStock: number;
  onSale: number;
  cheapest: number | null;
}

interface IDirectory {
  items: ICompany[];
  cities: string[];
  pricesCapturedAt: string | null;
}

@Component({
  selector: 'app-stores',
  standalone: true,
  imports: [RouterLink, CalcPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stores.html',
  styleUrl: './stores.css',
})
export class StoresComponent {
  private http = inject(HttpClient);

  directory = signal<IDirectory | null>(null);
  loading = signal(true);
  cityFilter = signal<string | null>(null);
  search = signal('');

  companies = computed(() => {
    const all = this.directory()?.items ?? [];
    const city = this.cityFilter();
    const q = this.search().trim().toLowerCase();

    return all
      .filter((c) => !city || c.city === city)
      .filter(
        (c) =>
          !q ||
          [c.name, c.city, c.area, c.address, ...(c.specialities ?? [])]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      );
  });

  cities = computed(() => this.directory()?.cities ?? []);

  countIn = (city: string) => (this.directory()?.items ?? []).filter((c) => c.city === city).length;

  capturedOn = computed(() => {
    const at = this.directory()?.pricesCapturedAt;
    return at ? new Date(at).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : null;
  });

  constructor() {
    this.http.get<IDirectory>('/api/suppliers').subscribe({
      next: (d) => {
        this.directory.set(d);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  mapsHref(company: ICompany): string {
    return `https://www.google.com/maps/search/${encodeURIComponent(
      company.address || `${company.name} ${company.city}`,
    )}`;
  }
}
