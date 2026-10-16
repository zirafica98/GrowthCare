import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Child, FamilyInvitation } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { NotificationService } from '../../core/services/notification.service';
import { NewMedicationInput, TherapyService } from '../../core/services/therapy.service';
import { ToastService } from '../../core/services/toast.service';
import { LogoComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { ChildFormComponent, ChildFormValue } from '../children/child-form.component';
import { MedicationFormComponent } from '../therapy/medication-form.component';

type Step = 'family' | 'child' | 'therapy' | 'invite' | 'notifications';

/** Flow A — first setup: family → child → therapy → partner → notifications → dashboard. */
@Component({
  selector: 'app-setup-page',
  imports: [FormsModule, LogoComponent, IconComponent, ChildFormComponent, MedicationFormComponent],
  template: `
    <div class="setup">
      <header class="row between">
        <app-logo [size]="32" />
        <button class="btn ghost sm" type="button" (click)="logout()">Odjava</button>
      </header>
      <ol class="steps" aria-label="Koraci">
        @for (s of steps; track s.key; let i = $index) {
          <li [class.done]="i < stepIndex()" [class.current]="i === stepIndex()" [attr.aria-current]="i === stepIndex() ? 'step' : null">
            <span class="dot">{{ i < stepIndex() ? '✓' : i + 1 }}</span><span class="lbl">{{ s.label }}</span>
          </li>
        }
      </ol>

      <section class="card stack lg">
        @switch (step()) {
          @case ('family') {
            <img class="ill" src="illustrations/family.png" alt="" />
            <h2>Dobro došli{{ firstName() ? ', ' + firstName() : '' }}!</h2>
            <p class="muted">Napravite porodicu. U nju ćete dodati decu i pozvati drugog roditelja.</p>
            <div class="field">
              <label for="fname">Naziv porodice</label>
              <input id="fname" class="input" [(ngModel)]="familyName" placeholder="npr. Porodica Petrović" maxlength="60" />
            </div>
            <button class="btn primary lg block" type="button" [disabled]="busy() || !familyName.trim()" (click)="createFamily()">Nastavi</button>
          }
          @case ('child') {
            <img class="ill" src="illustrations/boy-backpack.png" alt="" />
            <h2>Dodajte dete</h2>
            <p class="muted">Kasnije možete dodati još dece.</p>
            <app-child-form submitLabel="Nastavi" [busy]="busy()" (saved)="addChild($event)" />
          }
          @case ('therapy') {
            <img class="ill" src="illustrations/f-injection.png" alt="" />
            <h2>Terapija za {{ child()?.first_name }}</h2>
            <app-medication-form submitLabel="Sačuvaj terapiju" [busy]="busy()" (saved)="addTherapy($event)">
              <button class="btn ghost" type="button" (click)="step.set('invite')">Preskoči</button>
            </app-medication-form>
          }
          @case ('invite') {
            <img class="ill" src="illustrations/f-family.png" alt="" />
            <h2>Pozovite drugog roditelja</h2>
            <p class="muted">Oba roditelja vide istu decu i iste doze, svako sa svog telefona.</p>
            @if (invitation(); as inv) {
              <div class="notice success"><app-icon name="check-circle" [size]="18" /><span>Pozivnica je kreirana za {{ inv.email }}. Pošaljite link:</span></div>
              <div class="row"><input class="input" readonly [value]="family.inviteLink(inv)" aria-label="Link pozivnice" /><button class="btn outline" type="button" (click)="copy(family.inviteLink(inv))"><app-icon name="copy" [size]="18" /></button></div>
              <button class="btn primary lg block" type="button" (click)="step.set('notifications')">Nastavi</button>
            } @else {
              <div class="field">
                <label for="iemail">E-mail drugog roditelja</label>
                <input id="iemail" class="input" type="email" [(ngModel)]="inviteEmail" autocomplete="off" />
              </div>
              <div class="row" style="justify-content:flex-end">
                <button class="btn ghost" type="button" (click)="step.set('notifications')">Preskoči</button>
                <button class="btn primary" type="button" [disabled]="busy() || !validEmail()" (click)="invite()">Kreiraj pozivnicu</button>
              </div>
            }
          }
          @case ('notifications') {
            <img class="ill" src="illustrations/f-calendar.png" alt="" />
            <h2>Podsetnici</h2>
            <p class="muted">Dozvolite obaveštenja da vas podsetimo na dozu, kontrole i laboratoriju. Uvek ih možete promeniti u podešavanjima.</p>
            <button class="btn primary lg block" type="button" (click)="enableNotifications()">Dozvoli obaveštenja</button>
            <button class="btn ghost block" type="button" (click)="finish()">Ne sada</button>
          }
        }
      </section>
    </div>`,
  styles: [`
    .setup { max-width: 560px; margin: 0 auto; padding: calc(16px + var(--safe-top)) 16px 40px; display: flex; flex-direction: column; gap: 18px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; }
    .steps li { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11.5px; color: var(--text-3); text-align: center; }
    .dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #e9eef6; font-weight: 700; color: var(--text-2); }
    .steps li.current .dot { background: var(--primary); color: #fff; }
    .steps li.done .dot { background: var(--success-soft); color: var(--success); }
    .steps li.current { color: var(--text); font-weight: 600; }
    .ill { width: 120px; height: auto; align-self: center; border-radius: 20px; }
    @media (max-width: 420px) { .lbl { display: none; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupPage implements OnInit {
  readonly family = inject(FamilyService);
  private readonly children = inject(ChildService);
  private readonly therapy = inject(TherapyService);
  private readonly notifications = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly steps: { key: Step; label: string }[] = [
    { key: 'family', label: 'Porodica' }, { key: 'child', label: 'Dete' }, { key: 'therapy', label: 'Terapija' },
    { key: 'invite', label: 'Partner' }, { key: 'notifications', label: 'Podsetnici' },
  ];
  readonly step = signal<Step>('family');
  readonly busy = signal(false);
  readonly child = signal<Child | null>(null);
  readonly invitation = signal<FamilyInvitation | null>(null);
  familyName = '';
  inviteEmail = '';

  firstName(): string {
    return this.auth.user()?.full_name?.split(' ')[0] ?? '';
  }

  stepIndex(): number {
    return this.steps.findIndex((s) => s.key === this.step());
  }

  async ngOnInit(): Promise<void> {
    await this.family.ensureLoaded();
    if (this.family.current()) {
      await this.children.load();
      if (this.children.children().length) await this.router.navigateByUrl('/app');
      else this.step.set('child');
    }
  }

  validEmail(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.inviteEmail.trim());
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  createFamily(): Promise<void> {
    return this.run(async () => {
      await this.family.createFamily(this.familyName);
      this.step.set('child');
    });
  }

  addChild(v: ChildFormValue): Promise<void> {
    return this.run(async () => {
      this.child.set(await this.children.add(v));
      this.step.set('therapy');
    });
  }

  addTherapy(v: NewMedicationInput): Promise<void> {
    return this.run(async () => {
      await this.therapy.addMedication(this.child()!.id, v);
      this.step.set('invite');
    });
  }

  invite(): Promise<void> {
    return this.run(async () => {
      this.invitation.set(await this.family.invite(this.inviteEmail));
    });
  }

  async copy(text: string): Promise<void> {
    await navigator.clipboard?.writeText(text);
    this.toast.success('Link je kopiran.');
  }

  async enableNotifications(): Promise<void> {
    const res = await this.notifications.requestPermission();
    if (res === 'granted') this.toast.success('Obaveštenja su uključena.');
    await this.finish();
  }

  async finish(): Promise<void> {
    await this.router.navigateByUrl('/app/dashboard');
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
