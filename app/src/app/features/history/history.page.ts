import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditLog, InjectionStatus } from '../../core/models/models';
import { AuditService, diff, FieldDiff } from '../../core/services/audit.service';
import { DoseService } from '../../core/services/dose.service';
import { FamilyService } from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { addDays, formatDate, formatDateTime, startOfDay, toLocalDate, toLocalTime, WEEKDAYS_SHORT_SR, isoWeekday } from '../../core/utils/dates';
import { doseStats, DoseSlot, expectedSlots, STATUS_LABEL, weeklyStats } from '../../core/utils/dose-schedule';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent, StatusBadgeComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';
import { DoseSheetComponent } from '../doses/dose-sheet.component';

type Period = 7 | 30 | 90 | 365;

@Component({
  selector: 'app-history-page',
  imports: [FormsModule, PageHeaderComponent, IconComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent, DoseSheetComponent, SheetComponent],
  template: `
    <div class="page">
      <app-page-header title="Istorija doza" subtitle="Evidencija datih i propuštenih doza" />

      <div class="segmented" role="tablist" aria-label="Period">
        @for (p of periods; track p.v) {
          <button type="button" role="tab" [attr.aria-selected]="period() === p.v" (click)="period.set(p.v)">{{ p.l }}</button>
        }
      </div>

      <div class="chips" style="margin:12px 0" role="group" aria-label="Status">
        @for (s of statusFilters; track s.v) {
          <button type="button" class="chip" [attr.aria-pressed]="status() === s.v" (click)="status.set(s.v)">{{ s.l }}</button>
        }
        <button type="button" class="chip" [attr.aria-pressed]="showFilters()" (click)="showFilters.set(!showFilters())"><app-icon name="filter" [size]="16" /> Filteri</button>
      </div>

      @if (showFilters()) {
        <div class="card stack sm" style="margin-bottom:12px">
          <div class="grid-2">
            <div class="field"><label for="hf-med">Lek</label>
              <select id="hf-med" class="select" [ngModel]="medFilter()" (ngModelChange)="medFilter.set($event)">
                <option value="">Svi</option>
                @for (m of snap.value()?.meds ?? []; track m.id) { <option [value]="m.id">{{ m.name }}</option> }
              </select></div>
            <div class="field"><label for="hf-par">Roditelj</label>
              <select id="hf-par" class="select" [ngModel]="parentFilter()" (ngModelChange)="parentFilter.set($event)">
                <option value="">Svi</option>
                @for (m of family.members(); track m.id) { <option [value]="m.user_id">{{ family.memberName(m.user_id) }}</option> }
              </select></div>
          </div>
          <div class="field"><label for="hf-site">Mesto primene</label>
            <select id="hf-site" class="select" [ngModel]="siteFilter()" (ngModelChange)="siteFilter.set($event)">
              <option value="">Sva</option>
              @for (s of family.injectionSites(); track s) { <option [value]="s">{{ s }}</option> }
            </select></div>
        </div>
      }

      @if (snap.error()) {
        <app-error-state [message]="snap.error()!.message" (retry)="snap.reload()" />
      } @else if (snap.loading()) {
        <app-loading [rows]="5" [height]="64" />
      } @else {
        <section class="card stats" aria-label="Statistika perioda">
          <div><span class="big num">{{ stats().adherence ?? '—' }}{{ stats().adherence !== null ? '%' : '' }}</span><span class="tiny muted">redovnost</span></div>
          <div><span class="big num ok">{{ stats().given }}</span><span class="tiny muted">dato</span></div>
          <div><span class="big num warn">{{ stats().skipped }}</span><span class="tiny muted">nije dato</span></div>
          <div><span class="big num bad">{{ stats().missed }}</span><span class="tiny muted">nezabeleženo</span></div>
        </section>
        <p class="tiny muted" style="margin:6px 4px 0">
          Ukupno zabeleženo: @for (t of totals(); track t.unit) { <b class="num">{{ t.value }} {{ t.unit }}</b> } @empty { — }.
          Opisna statistika, bez medicinske procene.
        </p>

        @if (weeks().length > 1) {
          <div class="section-title"><h3>Po nedeljama</h3></div>
          <div class="card weeks">
            @for (w of weeks().slice(0, 8); track w.weekStart) {
              <div class="wk">
                <span class="tiny muted">od {{ fmtDate(w.weekStart) }}</span>
                <div class="bar" role="img" [attr.aria-label]="w.given + ' od ' + (w.expected - w.pending) + ' doza'">
                  <span class="g" [style.flex]="w.given"></span><span class="s" [style.flex]="w.skipped"></span><span class="m" [style.flex]="w.missed"></span><span class="p" [style.flex]="w.pending"></span>
                </div>
                <span class="small num strong">{{ w.given }}/{{ w.expected - w.pending }}</span>
              </div>
            }
          </div>
        }

        <div class="section-title"><h3>Zapisi</h3><span class="tiny muted">{{ filtered().length }}</span></div>
        @for (g of grouped(); track g.day) {
          <h4 class="day">{{ g.label }}</h4>
          <div class="card" style="padding:4px 12px">
            @for (s of g.slots; track s.medication.id + s.scheduledFor) {
              <div class="list-item">
                <button class="rowbtn grow" type="button" (click)="openDose(s)" [attr.aria-label]="'Izmeni zapis ' + g.label">
                  <span class="icon-tile sm" [class.success]="s.status === 'given'" [class.warning]="s.status === 'skipped'" [class.danger]="s.status === 'missed'"><app-icon name="syringe" [size]="16" /></span>
                  <span class="grow">
                    <span class="strong small">{{ s.medication.name }} · {{ s.record?.dose ?? s.medication.current_dose }} {{ s.medication.dose_unit }}</span>
                    <span class="tiny muted" style="display:block">
                      @if (s.status === 'given') { {{ time(s.record!.administered_at) }} · {{ family.memberName(s.record!.administered_by) }}{{ s.record!.injection_site ? ' · ' + s.record!.injection_site : '' }} }
                      @else if (s.status === 'skipped') { {{ s.record!.skip_reason }} }
                      @else if (s.status === 'missed') { Nije zabeleženo — dodirnite da dopunite }
                      @else { Termin {{ time(s.scheduledFor) }} }
                    </span>
                    @if (s.record && s.record.updated_at !== s.record.created_at) { <span class="badge" style="margin-top:4px">Izmenjeno</span> }
                  </span>
                  <app-status-badge [status]="s.status" />
                </button>
                @if (s.record) {
                  <button class="icon-btn" type="button" (click)="openDetails(s)" aria-label="Detalji i istorija izmena"><app-icon name="dots" /></button>
                }
              </div>
            }
          </div>
        } @empty {
          <app-empty-state title="Nema zapisa" text="Za izabrani period i filtere nema doza." image="illustrations/e-data.png" />
        }
      }
    </div>

    <app-dose-sheet [slot]="doseSlot()" (done)="doseSlot.set(null)" />

    <app-sheet [open]="!!detail()" title="Detalji zapisa" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="stack">
          <div class="card flat tight small">
            <div class="row between"><span class="muted">Status</span><app-status-badge [status]="d.slot.status" /></div>
            <div class="row between"><span class="muted">Termin</span><b>{{ fmtDateTime(d.slot.scheduledFor) }}</b></div>
            @if (d.slot.record?.administered_at) { <div class="row between"><span class="muted">Dato</span><b>{{ fmtDateTime(d.slot.record!.administered_at) }}</b></div> }
            @if (d.slot.record?.reaction) { <div class="row between"><span class="muted">Kako je prošlo</span><b>{{ reactionLabel(d.slot.record!.reaction) }}</b></div> }
            @if (d.slot.record?.note) { <div class="row between"><span class="muted">Napomena</span><b>{{ d.slot.record!.note }}</b></div> }
          </div>
          <h4>Istorija izmena</h4>
          @for (a of d.audit; track a.id) {
            <div class="audit">
              <div class="tiny muted">{{ fmtDateTime(a.created_at) }} · {{ family.memberName(a.user_id) }} · {{ a.action === 'insert' ? 'kreirano' : a.action === 'update' ? 'izmenjeno' : 'obrisano' }}</div>
              @for (c of changes(a); track c.field) { <div class="small">{{ c.label }}: <s class="muted">{{ show(c.before) }}</s> → <b>{{ show(c.after) }}</b></div> }
            </div>
          } @empty { <p class="small muted">Nema zabeleženih izmena.</p> }
          <button class="btn danger-soft block" type="button" (click)="remove(d.slot)"><app-icon name="trash" [size]="18" /> Obriši zapis</button>
        </div>
      }
    </app-sheet>`,
  styles: [`
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; padding: 14px 6px; }
    .stats > div { display: flex; flex-direction: column; gap: 2px; }
    .big { font-size: 22px; font-weight: 750; }
    .ok { color: var(--success); } .warn { color: var(--warning); } .bad { color: var(--danger); }
    .weeks { display: flex; flex-direction: column; gap: 10px; }
    .wk { display: grid; grid-template-columns: 92px 1fr 40px; align-items: center; gap: 10px; }
    .bar { display: flex; height: 10px; border-radius: 99px; overflow: hidden; background: var(--surface-2); }
    .bar .g { background: var(--success-accent); } .bar .s { background: var(--warning-accent); } .bar .m { background: var(--danger-accent); } .bar .p { background: var(--track); }
    .day { margin: 16px 4px 8px; font-size: 13px; color: var(--text-2); font-weight: 650; }
    .rowbtn { display: flex; align-items: center; gap: 12px; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: inherit; }
    .audit { padding: 8px 10px; border-left: 3px solid var(--primary-soft); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage {
  readonly family = inject(FamilyService);
  private readonly doses = inject(DoseService);
  private readonly audit = inject(AuditService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly periods: { v: Period; l: string }[] = [{ v: 7, l: '7 dana' }, { v: 30, l: '30 dana' }, { v: 90, l: '3 meseca' }, { v: 365, l: 'Godina' }];
  readonly statusFilters: { v: InjectionStatus | 'all'; l: string }[] = [
    { v: 'all', l: 'Sve' }, { v: 'given', l: 'Dato' }, { v: 'skipped', l: 'Nije dato' }, { v: 'missed', l: 'Nezabeleženo' },
  ];
  readonly period = signal<Period>(30);
  readonly status = signal<InjectionStatus | 'all'>('all');
  readonly showFilters = signal(false);
  readonly medFilter = signal('');
  readonly parentFilter = signal('');
  readonly siteFilter = signal('');
  readonly doseSlot = signal<DoseSlot | null>(null);
  readonly detail = signal<{ slot: DoseSlot; audit: AuditLog[] } | null>(null);

  readonly fmtDate = formatDate;
  readonly fmtDateTime = formatDateTime;
  readonly time = (iso: string | null) => (iso ? toLocalTime(new Date(iso)) : '');

  readonly snap = childData(async (id) => {
    const [meds, injections] = await Promise.all([this.doses.medications(id), this.doses.injections(id, addDays(startOfDay(new Date()), -366))]);
    return { meds, injections };
  });

  readonly slots = computed(() => {
    const s = this.snap.value();
    if (!s) return [];
    const now = new Date();
    return expectedSlots(s.meds, s.injections, addDays(startOfDay(now), -(this.period() - 1)), now).reverse();
  });

  readonly filtered = computed(() => this.slots().filter((s) =>
    (this.status() === 'all' || s.status === this.status()) &&
    (!this.medFilter() || s.medication.id === this.medFilter()) &&
    (!this.parentFilter() || s.record?.administered_by === this.parentFilter()) &&
    (!this.siteFilter() || s.record?.injection_site === this.siteFilter())));

  readonly stats = computed(() => doseStats(this.slots().filter((s) => !this.medFilter() || s.medication.id === this.medFilter())));
  readonly totals = computed(() => Object.entries(this.stats().totals).map(([unit, value]) => ({ unit, value: value.toLocaleString('sr-Latn', { maximumFractionDigits: 3 }) })));
  readonly weeks = computed(() => weeklyStats(this.slots()));

  readonly grouped = computed(() => {
    const map = new Map<string, DoseSlot[]>();
    for (const s of this.filtered()) {
      const k = toLocalDate(new Date(s.scheduledFor));
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    const today = toLocalDate(new Date());
    const yesterday = toLocalDate(addDays(new Date(), -1));
    return [...map.entries()].map(([day, slots]) => {
      const d = new Date(`${day}T12:00:00`);
      const label = day === today ? 'Danas' : day === yesterday ? 'Juče' : `${WEEKDAYS_SHORT_SR[isoWeekday(d) - 1]}, ${formatDate(day)}`;
      return { day, label, slots };
    });
  });

  openDose(s: DoseSlot): void {
    this.doseSlot.set(s);
  }

  async openDetails(s: DoseSlot): Promise<void> {
    const fam = this.family.current();
    const audit = fam && s.record ? await this.audit.forEntity(fam.id, s.record.id) : [];
    this.detail.set({ slot: s, audit });
  }

  changes(a: AuditLog): FieldDiff[] {
    return diff(a.old_data, a.new_data);
  }

  show(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
    if (typeof v === 'string' && v in STATUS_LABEL) return STATUS_LABEL[v as InjectionStatus];
    return String(v);
  }

  reactionLabel(r: string | null): string {
    return r === 'great' ? 'Odlično' : r === 'redness' ? 'Blago crvenilo' : r === 'other' ? 'Ostalo' : '';
  }

  async remove(s: DoseSlot): Promise<void> {
    if (!s.record) return;
    const ok = await this.confirm.ask({
      title: 'Obrisati zapis?', danger: true, confirmText: 'Obriši',
      message: `Biće obrisan zapis doze od ${formatDate(s.scheduledFor)}. Brisanje ostaje u istoriji izmena.`,
    });
    if (!ok) return;
    try {
      await this.doses.remove(s.record.id);
      this.detail.set(null);
      this.toast.success('Zapis je obrisan.');
    } catch (e) {
      this.toast.error(e);
    }
  }
}
