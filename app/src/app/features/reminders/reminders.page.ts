import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Reminder, ReminderType } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { REMINDER_TYPE_LABEL, ReminderService } from '../../core/services/reminder.service';
import { ToastService } from '../../core/services/toast.service';
import { combineLocal, formatDateTime, toLocalDate, toLocalTime } from '../../core/utils/dates';
import { buildRule, nextOccurrence, parseRule, ruleLabel } from '../../core/utils/recurrence';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';

const ICON: Record<ReminderType, { icon: string; tile: string }> = {
  dose: { icon: 'syringe', tile: 'warning' }, missed_dose: { icon: 'alert', tile: 'danger' }, appointment: { icon: 'calendar', tile: 'violet' },
  laboratory: { icon: 'flask', tile: 'warning' }, measurement: { icon: 'ruler', tile: 'success' }, stock: { icon: 'package', tile: 'pink' }, custom: { icon: 'bell', tile: '' },
};
const EDITABLE: ReminderType[] = ['custom', 'measurement', 'laboratory', 'stock'];
const DAYS = [{ d: 1, l: 'Pon' }, { d: 2, l: 'Uto' }, { d: 3, l: 'Sre' }, { d: 4, l: 'Čet' }, { d: 5, l: 'Pet' }, { d: 6, l: 'Sub' }, { d: 7, l: 'Ned' }];

@Component({
  selector: 'app-reminders-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, SheetComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Podsetnici" [subtitle]="children.selected()?.first_name ?? ''" />
      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <app-loading [rows]="4" [height]="64" />
      } @else {
        <div class="card" style="padding:4px 12px">
          @for (r of sorted(); track r.id) {
            <div class="list-item">
              <span class="icon-tile sm" [class]="'icon-tile sm ' + icon[r.type].tile"><app-icon [name]="icon[r.type].icon" [size]="16" /></span>
              <button class="grow tap" type="button" (click)="edit(r)" [disabled]="!editable(r)">
                <b class="small">{{ r.title }}</b>
                <span class="tiny muted" style="display:block">{{ typeLabel[r.type] }} · {{ ruleLabel(r.recurrence_rule) }} · {{ next(r) }}</span>
              </button>
              <span class="switch"><input type="checkbox" [checked]="r.enabled" (change)="toggle(r, $any($event.target).checked)" [attr.aria-label]="'Uključi podsetnik ' + r.title" /><span></span></span>
            </div>
          } @empty {
            <app-empty-state title="Nema podsetnika" text="Podsetnik za dozu nastaje automatski kada dodate terapiju." image="illustrations/e-notify.png" />
          }
        </div>
        <p class="tiny muted" style="margin:10px 4px">Podsetnik za dozu prati vreme iz <a routerLink="/app/therapy">terapije</a>; podsetnici za kontrole se podešavaju na <a routerLink="/app/doctors">kontroli</a>. Kada i kako stižu obaveštenja birate u <a routerLink="/app/settings">podešavanjima</a>.</p>
        <button class="btn outline primary-text block" type="button" (click)="create()"><app-icon name="plus" [size]="18" /> Dodaj podsetnik</button>
      }
    </div>

    <app-sheet [open]="formOpen()" [title]="editing() ? 'Izmeni podsetnik' : 'Novi podsetnik'" (closed)="formOpen.set(false)">
      <div class="stack">
        <div class="field"><span class="label">Vrsta</span>
          <div class="chips">@for (t of editableTypes; track t) { <button type="button" class="chip" [attr.aria-pressed]="type === t" (click)="type = t">{{ typeLabel[t] }}</button> }</div></div>
        <div class="field"><label for="r-title">Naziv</label><input id="r-title" class="input" [(ngModel)]="title" maxlength="120" placeholder="npr. Merenje visine" /></div>
        <div class="grid-2">
          <div class="field"><label for="r-date">Datum</label><input id="r-date" class="input" type="date" [(ngModel)]="date" /></div>
          <div class="field"><label for="r-time">Vreme</label><input id="r-time" class="input" type="time" [(ngModel)]="time" /></div>
        </div>
        <div class="field"><span class="label">Ponavljanje</span>
          <div class="segmented">
            @for (f of freqs; track f.v) { <button type="button" [attr.aria-selected]="freq === f.v" (click)="freq = f.v">{{ f.l }}</button> }
          </div>
          @if (freq === 'WEEKLY') {
            <div class="chips" style="margin-top:8px">@for (d of days; track d.d) { <button type="button" class="chip" [attr.aria-pressed]="byDay.includes(d.d)" (click)="toggleDay(d.d)">{{ d.l }}</button> }</div>
          }
        </div>
        <div class="field"><label for="r-desc">Opis (opciono)</label><input id="r-desc" class="input" [(ngModel)]="description" maxlength="300" /></div>
        <div class="sheet-actions">
          <button class="btn primary lg block" type="button" [disabled]="!title.trim() || busy()" (click)="save()">Sačuvaj</button>
          @if (editing()) { <button class="btn danger-soft block" type="button" (click)="remove()">Obriši</button> }
        </div>
      </div>
    </app-sheet>`,
  styles: [`.tap { background: none; border: 0; text-align: left; padding: 0; cursor: pointer; color: inherit; } .tap:disabled { cursor: default; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemindersPage {
  readonly children = inject(ChildService);
  private readonly reminders = inject(ReminderService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly icon = ICON;
  readonly typeLabel = REMINDER_TYPE_LABEL;
  readonly editableTypes = EDITABLE;
  readonly ruleLabel = ruleLabel;
  readonly days = DAYS;
  readonly freqs = [{ v: 'NONE', l: 'Jednom' }, { v: 'DAILY', l: 'Dnevno' }, { v: 'WEEKLY', l: 'Nedeljno' }, { v: 'MONTHLY', l: 'Mesečno' }] as const;
  readonly data = childData((id) => this.reminders.list(id));
  readonly formOpen = signal(false);
  readonly editing = signal<Reminder | null>(null);
  readonly busy = signal(false);

  readonly sorted = computed(() => {
    const order: ReminderType[] = ['dose', 'appointment', 'laboratory', 'measurement', 'stock', 'custom', 'missed_dose'];
    return [...(this.data.value() ?? [])].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.scheduled_for.localeCompare(b.scheduled_for));
  });

  type: ReminderType = 'custom';
  title = '';
  description = '';
  date = toLocalDate(new Date());
  time = '09:00';
  freq: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'NONE';
  byDay: number[] = [];

  editable(r: Reminder): boolean {
    return EDITABLE.includes(r.type);
  }

  next(r: Reminder): string {
    const n = nextOccurrence(r);
    return n ? formatDateTime(n) : 'prošlo';
  }

  create(): void {
    this.editing.set(null);
    Object.assign(this, { type: 'custom', title: '', description: '', date: toLocalDate(new Date()), time: '09:00', freq: 'NONE', byDay: [] });
    this.formOpen.set(true);
  }

  edit(r: Reminder): void {
    const at = new Date(r.scheduled_for);
    const rule = parseRule(r.recurrence_rule);
    this.editing.set(r);
    Object.assign(this, { type: r.type, title: r.title, description: r.description ?? '', date: toLocalDate(at), time: toLocalTime(at), freq: rule?.freq ?? 'NONE', byDay: rule?.byDay ?? [] });
    this.formOpen.set(true);
  }

  toggleDay(d: number): void {
    this.byDay = this.byDay.includes(d) ? this.byDay.filter((x) => x !== d) : [...this.byDay, d].sort();
  }

  async toggle(r: Reminder, enabled: boolean): Promise<void> {
    try {
      await this.reminders.setEnabled(r, enabled);
    } catch (e) {
      this.toast.error(e);
    }
  }

  async save(): Promise<void> {
    const childId = this.children.selectedChildId();
    if (!childId) return;
    this.busy.set(true);
    try {
      const e = this.editing();
      await this.reminders.save({
        ...(e ?? {}), child_id: e?.child_id ?? childId, type: this.type, title: this.title.trim(), description: this.description.trim() || null,
        scheduled_for: combineLocal(this.date, this.time).toISOString(), recurrence_rule: buildRule(this.freq, 1, this.byDay),
      });
      this.formOpen.set(false);
      this.toast.success('Podsetnik je sačuvan.');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const e = this.editing();
    if (!e || !(await this.confirm.ask({ title: 'Obrisati podsetnik?', message: `„${e.title}” biće obrisan.`, danger: true, confirmText: 'Obriši' }))) return;
    try {
      await this.reminders.remove(e.id);
      this.formOpen.set(false);
    } catch (err) {
      this.toast.error(err);
    }
  }
}
