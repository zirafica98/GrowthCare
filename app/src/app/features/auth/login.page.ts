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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
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

  async resetDemo(): Promise<void> {
    if (!confirm('Obrisati sve demo podatke sa ovog uređaja i učitati ih ponovo?')) return;
    await LocalDb.shared().reset();
    this.toast.info('Demo podaci se ponovo učitavaju…');
    location.reload();
  }
}
