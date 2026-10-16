import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { Child, InjectionReaction } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { DoseService } from '../../core/services/dose.service';
import { FamilyService } from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { combineLocal, toLocalDate, toLocalTime } from '../../core/utils/dates';
import { DoseSlot } from '../../core/utils/dose-schedule';
import { ChildAvatarComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';

/**
 * "Evidentiraj dozu" — the most frequent action in the app.
 * Pre-filled with the recorded dose and the current time, so the usual flow is
 * a single tap on "Potvrdi da je dato". Always shows child, medication, dose and
 * scheduled time to avoid cross-child mistakes.
 */
@Component({
  selector: 'app-dose-sheet',
  imports: [FormsModule, SheetComponent, IconComponent, ChildAvatarComponent],
  template: `
    <app-sheet [open]="!!slot()" [title]="mode() === 'give' ? 'Evidentiraj dozu' : 'Doza nije data'" (closed)="close()">
      @if (slot(); as s) {
        <div class="stack">
          <div class="summary">
            <app-child-avatar [child]="child()" [size]="44" />
            <div class="grow">
              <div class="strong">{{ child()?.first_name }}</div>
              <div class="small muted">{{ s.medication.name }} · <b class="num">{{ fmt(s.medication.current_dose) }} {{ s.medication.dose_unit }}</b> · termin {{ time(s.scheduledFor) }}</div>
            </div>
            <span class="badge info">{{ dayLabel(s.scheduledFor) }}</span>
          </div>

          @if (mode() === 'give') {
            <div class="grid-2">
              <div class="field">
                <label for="ds-dose">Data doza</label>
                <div class="input-group">
                  <input id="ds-dose" class="input num" type="number" inputmode="decimal" step="0.01" min="0" [(ngModel)]="dose" />
                  <span class="addon">{{ s.medication.dose_unit }}</span>
                </div>
              </div>
              <div class="field">
                <label for="ds-time">Vreme</label>
                <input id="ds-time" class="input" type="time" [(ngModel)]="givenTime" />
              </div>
            </div>
            @if (dose !== s.medication.current_dose) {
              <div class="notice warning"><app-icon name="alert" [size]="18" /><span>Unosite dozu različitu od zabeležene ({{ fmt(s.medication.current_dose) }} {{ s.medication.dose_unit }}). Proverite pre čuvanja.</span></div>
            }
            <div class="field">
              <span class="label">Mesto primene {{ lastSite() ? '· prošli put: ' + lastSite() : '' }}</span>
              <div class="chips">
                @for (site of family.injectionSites(); track site) {
                  <button type="button" class="chip" [attr.aria-pressed]="siteSel() === site" (click)="siteSel.set(siteSel() === site ? null : site)">{{ site }}</button>
                }
              </div>
            </div>
            <div class="field">
              <span class="label">Kako je prošlo?</span>
              <div class="grid-3">
                @for (r of reactions; track r.key) {
                  <button type="button" class="react" [class]="'react ' + r.key" [attr.aria-pressed]="reaction() === r.key" (click)="reaction.set(reaction() === r.key ? null : r.key)">
                    <app-icon [name]="r.icon" [size]="22" /><span>{{ r.label }}</span>
                  </button>
                }
              </div>
            </div>
            @if (family.activeMembers().length > 1) {
              <div class="field">
                <label for="ds-by">Dao/la</label>
                <select id="ds-by" class="select" [(ngModel)]="givenBy">
                  @for (m of family.activeMembers(); track m.id) { <option [value]="m.user_id">{{ family.memberName(m.user_id) }}</option> }
                </select>
              </div>
            }
            <div class="field">
              <label for="ds-note">Napomena (opciono)</label>
              <input id="ds-note" class="input" [(ngModel)]="note" placeholder="npr. nije bilo reakcije" maxlength="300" />
            </div>
            <div class="sheet-actions">
              <button class="btn success lg block" type="button" [disabled]="busy() || !(dose > 0)" (click)="give()">
                <app-icon name="check" /> {{ busy() ? 'Čuvanje…' : 'Potvrdi da je dato' }}
              </button>
              <button class="btn outline block" type="button" (click)="mode.set('skip')">Nije dato</button>
            </div>
          } @else {
            <div class="field">
              <span class="label">Razlog (obavezno)</span>
              <div class="chips">
                @for (r of family.skipReasons(); track r) {
                  <button type="button" class="chip" [attr.aria-pressed]="reason() === r" (click)="reason.set(r)">{{ r }}</button>
                }
              </div>
            </div>
            <div class="field">
              <label for="ds-snote">Napomena (opciono)</label>
              <input id="ds-snote" class="input" [(ngModel)]="note" maxlength="300" />
            </div>
            <p class="tiny muted">GrowthCare samo beleži šta se desilo i ne daje uputstva o propuštenoj dozi. Za savet se obratite lekaru.</p>
            <div class="sheet-actions">
              <button class="btn warning-soft lg block" type="button" [disabled]="busy() || !reason()" (click)="skip()">{{ busy() ? 'Čuvanje…' : 'Sačuvaj — nije dato' }}</button>
              <button class="btn ghost block" type="button" (click)="mode.set('give')">Nazad</button>
            </div>
          }
        </div>
      }
    </app-sheet>`,
  styles: [`
    .summary { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: var(--primary-softer); border: 1px solid var(--primary-border); }
    .react { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 14px; border: 1px solid var(--border-strong); background: var(--card); cursor: pointer; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
    .react[aria-pressed='true'].great { background: var(--success-soft); border-color: var(--success-border); color: var(--success); }
    .react[aria-pressed='true'].redness { background: var(--warning-soft); border-color: var(--warning-border); color: var(--warning); }
    .react[aria-pressed='true'].other { background: var(--primary-soft); border-color: var(--primary-border); color: var(--primary-strong); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoseSheetComponent {
  readonly family = inject(FamilyService);
  private readonly doses = inject(DoseService);
  private readonly children = inject(ChildService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly slot = input<DoseSlot | null>(null);
  readonly startMode = input<'give' | 'skip'>('give');
  readonly done = output<boolean>();

  readonly mode = signal<'give' | 'skip'>('give');
  readonly busy = signal(false);
  readonly siteSel = signal<string | null>(null);
  readonly reaction = signal<InjectionReaction>(null);
  readonly reason = signal<string | null>(null);
  readonly lastSite = signal<string | null>(null);
  readonly child = computed<Child | null>(() => this.children.children().find((c) => c.id === this.slot()?.medication.child_id) ?? null);
  /** Child id captured when the sheet opened — guards against switching child mid-flow. */
  private openedForChild: string | null = null;

  dose = 0;
  givenTime = '';
  givenBy = '';
  note = '';

  readonly reactions = [
    { key: 'great' as const, label: 'Odlično', icon: 'smile' },
    { key: 'redness' as const, label: 'Blago crvenilo', icon: 'meh' },
    { key: 'other' as const, label: 'Ostalo', icon: 'dots' },
  ];

  constructor() {
    effect(() => {
      const s = this.slot();
      const startMode = this.startMode();
      untracked(() => {
        if (!s) return;
        this.openedForChild = s.medication.child_id;
        this.mode.set(startMode);
        this.dose = s.record?.dose ?? s.medication.current_dose;
        this.givenTime = toLocalTime(new Date());
        this.givenBy = this.auth.user()?.id ?? '';
        this.note = s.record?.note ?? '';
        this.siteSel.set(s.record?.injection_site ?? null);
        this.reaction.set(s.record?.reaction ?? null);
        this.reason.set(s.record?.skip_reason ?? null);
        void this.doses.lastSite(s.medication.child_id).then((x) => this.lastSite.set(x));
      });
    });
    // If the selected child changes while the sheet is open, close it.
    effect(() => {
      const selected = this.children.selectedChildId();
      untracked(() => {
        if (this.slot() && this.openedForChild && selected !== this.openedForChild) this.close();
      });
    });
  }

  fmt(n: number): string {
    return n.toLocaleString('sr-Latn', { maximumFractionDigits: 3 });
  }

  time(iso: string): string {
    return toLocalTime(new Date(iso));
  }

  dayLabel(iso: string): string {
    return toLocalDate(new Date(iso)) === toLocalDate(new Date()) ? 'Danas' : new Date(iso).toLocaleDateString('sr-Latn');
  }

  close(): void {
    this.done.emit(false);
  }

  async give(): Promise<void> {
    const s = this.slot();
    if (!s || !this.openedForChild) return;
    this.busy.set(true);
    try {
      const day = toLocalDate(new Date(s.scheduledFor));
      let at = combineLocal(day, this.givenTime || toLocalTime(new Date()));
      // A dose given after midnight for yesterday's evening slot.
      if (at.getTime() < new Date(s.scheduledFor).getTime() - 12 * 3600_000) at = new Date(at.getTime() + 86_400_000);
      await this.doses.give(s, {
        dose: Number(this.dose), administeredAt: at, site: this.siteSel(), reaction: this.reaction(),
        note: this.note.trim() || null, administeredBy: this.givenBy || null,
      }, this.openedForChild);
      this.toast.success(`Doza je zabeležena za ${this.child()?.first_name ?? 'dete'}.`);
      this.done.emit(true);
    } catch (e) {
      this.toast.error(e);
      this.done.emit(true); // refresh to show the other parent's record on conflict
    } finally {
      this.busy.set(false);
    }
  }

  async skip(): Promise<void> {
    const s = this.slot();
    const r = this.reason();
    if (!s || !r || !this.openedForChild) return;
    this.busy.set(true);
    try {
      await this.doses.skip(s, r, this.note.trim() || null, this.openedForChild);
      this.toast.info('Zabeleženo je da doza nije data.');
      this.done.emit(true);
    } catch (e) {
      this.toast.error(e);
      this.done.emit(true);
    } finally {
      this.busy.set(false);
    }
  }
}
