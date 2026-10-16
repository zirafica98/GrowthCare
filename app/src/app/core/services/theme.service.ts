import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'gc.theme';

/** Light / dark / follow-the-phone theme. Only the preference is stored (no personal data). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>((localStorage.getItem(KEY) as ThemeMode | null) ?? 'system');
  readonly effective = signal<'light' | 'dark'>('light');
  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  constructor() {
    this.media?.addEventListener('change', () => this.apply());
    this.apply();
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(KEY, mode);
    this.apply();
  }

  private apply(): void {
    const dark = this.mode() === 'dark' || (this.mode() === 'system' && !!this.media?.matches);
    this.effective.set(dark ? 'dark' : 'light');
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1420' : '#f5f8fc');
  }
}
