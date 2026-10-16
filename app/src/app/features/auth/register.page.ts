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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
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
