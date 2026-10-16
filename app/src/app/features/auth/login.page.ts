import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { DEMO_ACCOUNTS } from '../../core/data/local/demo-seed';
import { LocalDb } from '../../core/data/local/local-db';
import { isDemoMode } from '../../core/data/provide-backend';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { AuthShellComponent } from './auth-shell.component';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent],
  template: `
    <app-auth-shell title="Prijava">
      @if (auth.supportsOAuth) {
        <button class="btn outline block google" type="button" (click)="google()" [disabled]="busy()">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Nastavi sa Google nalogom
        </button>
        <div class="or"><span>ili e-mailom</span></div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="email" inputmode="email" />
        </div>
        <div class="field">
          <label for="password">Lozinka</label>
          <input id="password" class="input" type="password" formControlName="password" autocomplete="current-password" />
        </div>
        @if (error()) { <div class="notice danger" role="alert"><app-icon name="alert" [size]="18" />{{ error() }}</div> }
        <button class="btn primary lg block" type="submit" [disabled]="busy()">{{ busy() ? 'Prijavljivanje…' : 'Prijava' }}</button>
        <a class="btn outline primary-text block" routerLink="/register" [queryParams]="{ next: next() }">Kreiraj nalog</a>
        <a class="center small" routerLink="/forgot-password">Zaboravili ste lozinku?</a>
      </form>

      @if (demo) {
        <hr class="divider" />
        <div class="stack sm">
          <p class="small muted"><b>Demo režim.</b> Podaci se čuvaju samo na ovom uređaju. Probajte nalog:</p>
          @for (a of accounts; track a.key) {
            <button class="list-item" type="button" (click)="loginDemo(a.email, a.password)" [disabled]="busy()">
              <span class="icon-tile sm" [class.violet]="a.key === 'c'"><app-icon [name]="a.key === 'c' ? 'shield' : 'user'" [size]="16" /></span>
              <span class="grow"><b class="small">{{ a.label }}</b><span class="tiny muted" style="display:block">{{ a.name }}</span></span>
              <app-icon name="chevron-right" [size]="18" />
            </button>
          }
          <button class="btn ghost sm" type="button" (click)="resetDemo()">Vrati demo podatke na početak</button>
        </div>
      }
    </app-auth-shell>`,
  styles: [`.google { gap: 10px; } .or { display: flex; align-items: center; gap: 10px; color: var(--text-3); font-size: 12.5px; margin: 2px 0; }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  readonly next = input<string>('');
  readonly demo = isDemoMode;
  readonly accounts = DEMO_ACCOUNTS;
  readonly busy = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Unesite e-mail i lozinku.');
      return;
    }
    await this.signIn(this.form.getRawValue().email, this.form.getRawValue().password);
  }

  loginDemo(email: string, password: string): Promise<void> {
    return this.signIn(email, password);
  }

  private async signIn(email: string, password: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signIn(email, password);
      const next = this.next();
      await this.router.navigateByUrl(next && next.startsWith('/') && !next.startsWith('//') ? next : '/app');
    } catch (e) {
      this.error.set((e as Error).message || 'Prijava nije uspela.');
    } finally {
      this.busy.set(false);
    }
  }

  async google(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithGoogle(this.next() || '/app');
    } catch (e) {
      this.error.set((e as Error).message);
      this.busy.set(false);
    }
  }

  async resetDemo(): Promise<void> {
    if (!confirm('Obrisati sve demo podatke sa ovog uređaja i učitati ih ponovo?')) return;
    await LocalDb.shared().reset();
    this.toast.info('Demo podaci se ponovo učitavaju…');
    location.reload();
  }
}
