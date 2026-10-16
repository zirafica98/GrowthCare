import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FamilyService } from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { AuthShellComponent } from '../auth/auth-shell.component';

/** Flow I — partner accepts an invitation (must be signed in with the invited e-mail). */
@Component({
  selector: 'app-invite-accept-page',
  imports: [RouterLink, AuthShellComponent, IconComponent],
  template: `
    <app-auth-shell title="Pozivnica u porodicu">
      @if (!auth.user()) {
        <p class="muted">Da biste prihvatili pozivnicu, prijavite se ili napravite nalog sa e-mail adresom na koju je pozivnica poslata.</p>
        <a class="btn primary block" routerLink="/login" [queryParams]="{ next: '/invite/' + token() }">Prijava</a>
        <a class="btn outline primary-text block" routerLink="/register" [queryParams]="{ next: '/invite/' + token() }">Kreiraj nalog</a>
      } @else if (loading()) {
        <div class="skeleton" style="height:80px"></div>
      } @else if (!info()) {
        <div class="notice danger"><app-icon name="alert" [size]="18" /><span>Pozivnica nije pronađena.</span></div>
      } @else {
        <div class="card soft stack sm">
          <div class="small muted">Porodica</div><h3>{{ info()!.family_name }}</h3>
          <div class="small muted">Poziva vas: <b>{{ info()!.invited_by }}</b> · za {{ info()!.email }}</div>
        </div>
        @if (info()!.status !== 'pending') {
          <div class="notice warning"><app-icon name="alert" [size]="18" /><span>Pozivnica više nije važeća ({{ info()!.status === 'accepted' ? 'već prihvaćena' : info()!.status === 'expired' ? 'istekla' : 'opozvana' }}).</span></div>
        } @else if (info()!.email !== auth.user()!.email.toLowerCase()) {
          <div class="notice warning"><app-icon name="alert" [size]="18" /><span>Prijavljeni ste kao {{ auth.user()!.email }}, a pozivnica je za {{ info()!.email }}. Prijavite se odgovarajućim nalogom.</span></div>
          <button class="btn outline block" type="button" (click)="switchAccount()">Promeni nalog</button>
        } @else {
          <button class="btn primary lg block" type="button" [disabled]="busy()" (click)="accept()">Prihvati pozivnicu</button>
        }
      }
    </app-auth-shell>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteAcceptPage implements OnInit {
  readonly token = input.required<string>();
  readonly auth = inject(AuthService);
  private readonly family = inject(FamilyService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly info = signal<{ family_name: string; invited_by: string; email: string; status: string } | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);

  async ngOnInit(): Promise<void> {
    await this.auth.init();
    if (!this.auth.user()) return;
    try {
      this.info.set(await this.family.getInvitation(this.token()));
    } catch {
      this.info.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async accept(): Promise<void> {
    this.busy.set(true);
    try {
      await this.family.acceptInvitation(this.token());
      this.toast.success('Dobro došli u porodicu!');
      await this.router.navigateByUrl('/app/dashboard');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async switchAccount(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login'], { queryParams: { next: `/invite/${this.token()}` } });
  }
}
