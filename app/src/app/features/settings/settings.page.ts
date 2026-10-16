import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, PASSWORD_RULES } from '../../core/auth/auth.service';
import { DataService } from '../../core/data/data.service';
import { isDemoMode } from '../../core/data/provide-backend';
import { NotificationPreferences } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { NotificationService } from '../../core/services/notification.service';
import { TimelineService } from '../../core/services/timeline.service';
import { ToastService } from '../../core/services/toast.service';
import { OfflineSyncService } from '../../core/sync/offline-sync.service';
import { toLocalDate } from '../../core/utils/dates';
import { PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';

type PrefKey = keyof Pick<NotificationPreferences, 'dose_enabled' | 'missed_dose_enabled' | 'appointment_enabled' | 'laboratory_enabled' | 'measurement_enabled' | 'stock_enabled' | 'custom_enabled'>;

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent],
  template: `
    <div class="page">
      <app-page-header title="Podešavanja" />

      <div class="section-title" style="margin-top:0"><h3>Nalog</h3></div>
      <section class="card stack">
        <div class="field"><label for="s-name">Ime i prezime</label>
          <div class="row"><input id="s-name" class="input" [(ngModel)]="fullName" maxlength="80" /><button class="btn outline" type="button" (click)="saveName()">Sačuvaj</button></div></div>
        <div class="small muted">E-mail: {{ auth.user()?.email }}</div>
      </section>

      <div class="section-title"><h3>Porodica i deca</h3></div>
      <div class="card" style="padding:4px 12px">
        <a class="list-item" routerLink="/app/family"><span class="icon-tile sm"><app-icon name="users" [size]="16" /></span><span class="grow small strong">{{ family.current()?.name }}</span><app-icon name="chevron-right" [size]="16" /></a>
        @for (c of children.children(); track c.id) {
          <a class="list-item" [routerLink]="['/app/children', c.id]"><span class="icon-tile sm success"><app-icon name="baby" [size]="16" /></span><span class="grow small">{{ c.first_name }}</span><app-icon name="chevron-right" [size]="16" /></a>
        }
      </div>

      <div class="section-title"><h3>Obaveštenja</h3></div>
      <section class="card stack sm">
        @if (notifications.permission() !== 'granted') {
          <div class="notice info"><app-icon name="bell" [size]="18" /><span class="grow small">{{ notifications.permission() === 'denied' ? 'Obaveštenja su blokirana u podešavanjima telefona/pregledača.' : notifications.permission() === 'unsupported' ? 'Ovaj pregledač ne podržava obaveštenja. Instalirajte aplikaciju na početni ekran.' : 'Obaveštenja na uređaju nisu uključena.' }}</span>
            @if (notifications.permission() === 'default') { <button class="btn sm primary" type="button" (click)="notifications.requestPermission()">Uključi</button> }</div>
        }
        @if (prefs(); as p) {
          @for (t of prefRows; track t.key) {
            <label class="row between" style="min-height:44px">
              <span class="small">{{ t.label }}</span>
              <span class="switch"><input type="checkbox" [checked]="p[t.key]" (change)="setPref(t.key, $any($event.target).checked)" [attr.aria-label]="t.label" /><span></span></span>
            </label>
          }
          <div class="field"><label for="s-md">Podseti ako doza nije zabeležena posle (min)</label>
            <input id="s-md" class="input num" type="number" min="5" max="600" [ngModel]="p.missed_dose_after_minutes" (change)="setNum($any($event.target).value)" /></div>
          <div class="grid-2">
            <div class="field"><label for="s-q1">Tihi sati od</label><input id="s-q1" class="input" type="time" [ngModel]="p.quiet_hours_start" (change)="setQuiet('quiet_hours_start', $any($event.target).value)" /></div>
            <div class="field"><label for="s-q2">do</label><input id="s-q2" class="input" type="time" [ngModel]="p.quiet_hours_end" (change)="setQuiet('quiet_hours_end', $any($event.target).value)" /></div>
          </div>
          <p class="tiny muted">Tihi sati ne važe za podsetnik za dozu — njegovo vreme ste sami izabrali.</p>
        }
      </section>

      <div class="section-title"><h3>Bezbednost</h3></div>
      <section class="card stack">
        <div class="field"><label for="s-pw">Nova lozinka</label>
          <div class="row"><input id="s-pw" class="input" type="password" autocomplete="new-password" [(ngModel)]="password" /><button class="btn outline" type="button" [disabled]="password.length < 8" (click)="changePassword()">Promeni</button></div>
          <span class="field-hint">{{ pwRules }}</span></div>
        <a class="list-item" routerLink="/app/audit"><span class="icon-tile sm"><app-icon name="history" [size]="16" /></span><span class="grow small">Istorija izmena (audit)</span><app-icon name="chevron-right" [size]="16" /></a>
        <div class="small muted"><app-icon name="shield" [size]="14" /> Podaci su dostupni samo članovima vaše porodice. Dokumenti se čuvaju privatno i otvaraju se kratkotrajnim linkovima.</div>
      </section>

      <div class="section-title"><h3>Podaci</h3></div>
      <section class="card stack sm">
        <button class="btn outline block" type="button" [disabled]="busy()" (click)="exportJson()"><app-icon name="download" [size]="18" /> Izvezi podatke (JSON)</button>
        <p class="tiny muted">Izvoz sadrži strukturirane podatke izabranog deteta. Izvoz dokumenata u ZIP biće dodat.</p>
        <p class="tiny muted">Sinhronizacija: {{ sync.state() === 'synced' ? 'sve je poslato' : sync.pendingCount() + ' unosa čeka slanje' }}{{ demo ? ' · demo režim (podaci samo na ovom uređaju)' : '' }}</p>
      </section>

      <button class="btn outline block" type="button" style="margin-top:18px" (click)="logout()"><app-icon name="logout" [size]="18" /> Odjava</button>

      <div class="section-title"><h3 style="color:var(--danger)">Opasna zona</h3></div>
      <section class="card stack sm" style="border-color:#f3c9c9">
        @if (family.isOwner()) {
          <button class="btn danger-soft block" type="button" (click)="deleteFamily()">Obriši porodicu i sve podatke</button>
        }
        <p class="tiny muted">Brisanje deteta je na profilu deteta. Za brisanje naloga obrišite porodicu (ili je napustite), pa nam pišite — nalog se trajno uklanja sa servera.</p>
      </section>
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage implements OnInit {
  readonly auth = inject(AuthService);
  readonly family = inject(FamilyService);
  readonly children = inject(ChildService);
  readonly notifications = inject(NotificationService);
  readonly sync = inject(OfflineSyncService);
  private readonly data = inject(DataService);
  private readonly timeline = inject(TimelineService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  readonly demo = isDemoMode;
  readonly pwRules = PASSWORD_RULES;
  readonly prefs = this.notifications.prefs;
  readonly busy = signal(false);
  readonly prefRows: { key: PrefKey; label: string }[] = [
    { key: 'dose_enabled', label: 'Dnevna doza' }, { key: 'missed_dose_enabled', label: 'Doza nije zabeležena' },
    { key: 'appointment_enabled', label: 'Kontrole kod lekara' }, { key: 'laboratory_enabled', label: 'Laboratorija' },
    { key: 'measurement_enabled', label: 'Merenja' }, { key: 'stock_enabled', label: 'Nabavka terapije' }, { key: 'custom_enabled', label: 'Ostali podsetnici' },
  ];
  fullName = '';
  password = '';

  async ngOnInit(): Promise<void> {
    this.fullName = this.auth.user()?.full_name ?? '';
    if (!this.prefs()) await this.notifications.loadPreferences().catch(() => undefined);
  }

  private async savePref(patch: Partial<NotificationPreferences>): Promise<void> {
    try {
      await this.notifications.savePreferences(patch);
    } catch (e) {
      this.toast.error(e);
    }
  }

  setPref(key: PrefKey, v: boolean): Promise<void> {
    return this.savePref({ [key]: v });
  }

  setNum(v: string): Promise<void> {
    return this.savePref({ missed_dose_after_minutes: Math.min(600, Math.max(5, Number(v) || 60)) });
  }

  setQuiet(key: 'quiet_hours_start' | 'quiet_hours_end', v: string): Promise<void> {
    return this.savePref({ [key]: v || null });
  }

  async saveName(): Promise<void> {
    const uid = this.auth.user()?.id;
    if (!uid || !this.fullName.trim()) return;
    try {
      await this.data.update('profiles', uid, { full_name: this.fullName.trim() });
      this.toast.success('Ime je sačuvano.');
    } catch (e) {
      this.toast.error(e);
    }
  }

  async changePassword(): Promise<void> {
    try {
      await this.auth.updatePassword(this.password);
      this.password = '';
      this.toast.success('Lozinka je promenjena.');
    } catch (e) {
      this.toast.error(e);
    }
  }

  async exportJson(): Promise<void> {
    const c = this.children.selected();
    if (!c) return;
    this.busy.set(true);
    try {
      const snap = await this.timeline.snapshot(c.id);
      const payload = { exported_at: new Date().toISOString(), app: 'GrowthCare', child: c, ...snap, documents: snap.documents.map(({ ocr_text: _t, ...d }) => d) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `growthcare-${c.first_name.toLowerCase()}-${toLocalDate(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    const pending = this.auth.pendingWrites();
    if (pending) {
      const ok = await this.confirm.ask({ title: 'Odjaviti se?', danger: true, confirmText: 'Odjavi se', message: `${pending} unos(a) još nije poslato na server i biće izgubljeno. Povežite se na internet pre odjave.` });
      if (!ok) return;
    }
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }

  async deleteFamily(): Promise<void> {
    const f = this.family.current();
    if (!f) return;
    const ok = await this.confirm.ask({
      title: 'Obrisati porodicu?', danger: true, confirmText: 'Obriši sve', typeToConfirm: 'OBRIŠI',
      message: `Trajno se brišu porodica „${f.name}”, sva deca, doze, merenja, kontrole, laboratorija, dokumenti i istorija izmena. Drugi roditelj takođe gubi pristup.`,
    });
    if (!ok) return;
    try {
      for (const c of this.children.children()) await this.children.remove(c.id);
      await this.family.deleteFamily();
      await this.router.navigateByUrl('/setup');
    } catch (e) {
      this.toast.error(e);
    }
  }
}
