import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'shopzone.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal<boolean>(this.initial());

  constructor() {
    effect(() => {
      const dark = this.isDark();
      const root = document.documentElement;

      // Suppress transitions for this frame. Blink otherwise leaves a
      // transitioned background-color pinned to its old value when the custom
      // property behind it changes, which left the page background — and any
      // element with `transition: all` — stuck in the previous theme.
      root.classList.add('theme-switching');

      // `data-theme` drives the design tokens; `.dark-theme` keeps the older
      // component stylesheets working until they are all on tokens.
      root.dataset['theme'] = dark ? 'dark' : 'light';
      document.body.classList.toggle('dark-theme', dark);

      // Two frames: one for the new values to be applied, one to paint them
      // before transitions are allowed back.
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));

      try {
        localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
      } catch {
        /* storage unavailable */
      }
    });
  }

  toggle(): void {
    this.isDark.update((v) => !v);
  }

  /** Stored choice wins; otherwise follow the operating system. */
  private initial(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored === 'dark';
    } catch {
      /* storage unavailable */
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
