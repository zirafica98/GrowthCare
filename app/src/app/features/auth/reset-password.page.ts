import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, PASSWORD_RULES } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { AuthShellComponent } from './auth-shell.component';
import { strongPassword } from './register.page';

/** Landing page of the Supabase password-recovery link. */
@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, AuthShellComponent, IconComponent],
  template: `
    <app-auth-shell title="Nova lozinka">
      <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
        <div class="field">
          <label for="pw">Nova lozinka</label>
          <input id="pw" class="input" type="password" formControlName="password" autocomplete="new-password" />
          <span class="field-hint">{{ rules }}</span>
        </div>
        @if (error()) { <div class="notice danger" role="alert"><app-icon name="alert" [size]="18" />{{ error() }}</div> }
        <button class="btn primary lg block" type="submit" [disabled]="form.invalid || busy()">Sačuvaj lozinku</button>
      </form>
    </app-auth-shell>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly rules = PASSWORD_RULES;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({ password: ['', [Validators.required, strongPassword]] });

  async submit(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.updatePassword(this.form.getRawValue().password);
      this.toast.success('Lozinka je promenjena.');
      await this.router.navigateByUrl('/app');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
