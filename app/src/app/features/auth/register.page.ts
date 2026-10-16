import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, isStrongPassword, PASSWORD_RULES } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { AuthShellComponent } from './auth-shell.component';

export function strongPassword(c: AbstractControl): ValidationErrors | null {
  return isStrongPassword(String(c.value ?? '')) ? null : { weak: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent],
  template: `
    <app-auth-shell title="Kreiraj nalog">
      @if (sent()) {
        <div class="notice success" role="status"><app-icon name="mail" [size]="18" />
          <span>Poslali smo vam e-mail za potvrdu naloga. Otvorite link iz poruke, pa se prijavite.</span></div>
        <a class="btn primary block" routerLink="/login">Nazad na prijavu</a>
      } @else {
        @if (auth.supportsOAuth) {
        <button class="btn outline block google" type="button" (click)="google()" [disabled]="busy()">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Nastavi sa Google nalogom
        </button>
        <div class="or"><span>ili e-mailom</span></div>
      }
        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field">
            <label for="name">Ime i prezime</label>
            <input id="name" class="input" formControlName="fullName" autocomplete="name" />
          </div>
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" class="input" type="email" formControlName="email" autocomplete="email" />
          </div>
          <div class="field">
            <label for="password">Lozinka</label>
            <input id="password" class="input" type="password" formControlName="password" autocomplete="new-password" aria-describedby="pwhint" />
            <span id="pwhint" class="field-hint" [class.field-error]="form.controls.password.touched && form.controls.password.invalid">{{ rules }}</span>
          </div>
          @if (error()) { <div class="notice danger" role="alert"><app-icon name="alert" [size]="18" />{{ error() }}</div> }
          <button class="btn primary lg block" type="submit" [disabled]="busy()">{{ busy() ? 'Kreiranje…' : 'Kreiraj nalog' }}</button>
          <a class="center small" routerLink="/login" [queryParams]="{ next: next() }">Već imate nalog? Prijavite se</a>
        </form>
      }
    </app-auth-shell>`,
  styles: [`.google { gap: 10px; } .or { display: flex; align-items: center; gap: 10px; color: var(--text-3); font-size: 12.5px; margin: 2px 0; }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly next = input<string>('');
  readonly rules = PASSWORD_RULES;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly sent = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, strongPassword]],
  });

  async google(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signInWithGoogle(this.next() || '/setup');
    } catch (e) {
      this.error.set((e as Error).message);
      this.busy.set(false);
    }
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Proverite unete podatke.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const res = await this.auth.signUp(v.email, v.password, v.fullName);
      if (res.needsConfirmation) this.sent.set(true);
      else {
        const next = this.next();
        await this.router.navigateByUrl(next && next.startsWith('/') && !next.startsWith('//') ? next : '/setup');
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
