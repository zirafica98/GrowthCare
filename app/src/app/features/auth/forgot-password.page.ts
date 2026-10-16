import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { isDemoMode } from '../../core/data/provide-backend';
import { IconComponent } from '../../shared/ui/icon.component';
import { AuthShellComponent } from './auth-shell.component';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, IconComponent],
  template: `
    <app-auth-shell title="Zaboravljena lozinka">
      @if (demo) {
        <div class="notice info"><app-icon name="info" [size]="18" /><span>U demo režimu se e-mail ne šalje. Koristite demo naloge sa ekrana za prijavu.</span></div>
      }
      @if (done()) {
        <div class="notice success" role="status"><app-icon name="mail" [size]="18" />
          <span>Ako nalog postoji, poslali smo uputstvo za novu lozinku na tu adresu.</span></div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" class="input" type="email" formControlName="email" autocomplete="email" />
          </div>
          <button class="btn primary lg block" type="submit" [disabled]="busy() || form.invalid">Pošalji link</button>
        </form>
      }
      <a class="center small" routerLink="/login">Nazad na prijavu</a>
    </app-auth-shell>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  readonly demo = isDemoMode;
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });

  async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.resetPassword(this.form.getRawValue().email);
    } catch {
      // Same message either way — do not reveal whether an account exists.
    }
    this.done.set(true);
    this.busy.set(false);
  }
}
