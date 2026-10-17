import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { GrowthMeasurement, MeasurementSource } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { GrowthService } from '../../core/services/growth.service';
import { ToastService } from '../../core/services/toast.service';
import { combineLocal, formatDate, toLocalDate, toLocalTime } from '../../core/utils/dates';
import { bmi, formatSigned, lastChange, Metric, series, velocities } from '../../core/utils/growth';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { LineChartComponent } from '../../shared/ui/line-chart.component';
import { SheetComponent } from '../../shared/ui/sheet.component';

const METRICS: { key: Metric; label: string; unit: string; color: string }[] = [
  { key: 'height_cm', label: 'Visina', unit: 'cm', color: '#2f6fe4' },
  { key: 'weight_kg', label: 'Težina', unit: 'kg', color: '#12976a' },
  { key: 'bmi', label: 'BMI', unit: 'kg/m²', color: '#6d5bd0' },
  { key: 'head_circumference_cm', label: 'Obim glave', unit: 'cm', color: '#c2410c' },
];
const SOURCES: { v: MeasurementSource; l: string }[] = [
  { v: 'home', l: 'Kod kuće' }, { v: 'doctor', l: 'Kod lekara' }, { v: 'document', l: 'Iz dokumenta' }, { v: 'other', l: 'Drugo' },
];

@Component({
  selector: 'app-growth-page',
  imports: [ReactiveFormsModule, PageHeaderComponent, IconComponent, LineChartComponent, SheetComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Rast i razvoj" [subtitle]="children.selected()?.first_name ?? ''">
        <button class="btn primary sm" type="button" (click)="openNew()"><app-icon name="plus" [size]="18" /> Novo merenje</button>
      </app-page-header>

      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <app-loading [rows]="2" [height]="180" />
      } @else if (!(data.value()?.length)) {
        <app-empty-state title="Nema merenja" text="Unesite visinu i težinu da biste videli grafik rasta." image="illustrations/e-measure.png">
          <button class="btn primary" type="button" (click)="openNew()">Dodaj merenje</button>
        </app-empty-state>
      } @else {
        <div class="segmented" role="tablist" aria-label="Pokazatelj">
          @for (m of availableMetrics(); track m.key) {
            <button type="button" role="tab" [attr.aria-selected]="metric() === m.key" (click)="metric.set(m.key)">{{ m.label }}</button>
          }
        </div>

        <section class="card" style="margin-top:12px">
          <div class="row between top">
            <img class="hero-ill" [src]="metricIllustration()" alt="" width="76" height="76" />
            <div>
              <div class="small muted">{{ current().label }} — poslednje merenje</div>
              <div class="hero num">{{ latest() ? fmt(latest()!.value) : '—' }} <small>{{ current().unit }}</small></div>
              @if (latest()) { <div class="tiny muted">{{ fmtDate(latest()!.date) }}</div> }
            </div>
          </div>
          @if (change(); as c) {
            <p class="small" style="margin:6px 0 0"><span class="badge" [class.success]="c.delta > 0">{{ signed(c.delta, current().unit) }}</span> <span class="muted">od prethodnog merenja ({{ c.days }} dana)</span></p>
          }
          <app-line-chart [points]="points()" [unit]="current().unit" [color]="current().color" [label]="current().label" [height]="230" />
        </section>

        @if (metric() === 'height_cm' && vel().length) {
          <div class="section-title"><h3>Brzina rasta</h3></div>
          <div class="card">
            <table class="table">
              <thead><tr><th>Period</th><th>Promena</th><th>cm/god.</th></tr></thead>
              <tbody>
                @for (v of vel().slice(0, 6); track v.to) {
                  <tr><td class="small">{{ fmtDate(v.from) }} – {{ fmtDate(v.to) }}</td><td class="num">{{ signed(v.delta, 'cm') }}</td><td class="num">{{ v.perYear ?? '—' }}</td></tr>
                }
              </tbody>
            </table>
            <p class="tiny muted" style="margin-top:8px">Izračunato iz unetih merenja (za periode od najmanje 28 dana). Ovo je opisni podatak — tumačenje rasta daje lekar.</p>
          </div>
        }

        <div class="section-title"><h3>Sva merenja</h3><span class="tiny muted">{{ data.value()!.length }}</span></div>
        <div class="card" style="padding:4px 12px">
          @for (m of reversed(); track m.id) {
            <button class="list-item" type="button" (click)="openEdit(m)">
              <span class="icon-tile sm"><app-icon name="ruler" [size]="16" /></span>
              <span class="grow">
                <b class="small num">{{ m.height_cm != null ? fmt(m.height_cm) + ' cm' : '' }}{{ m.height_cm != null && m.weight_kg != null ? ' · ' : '' }}{{ m.weight_kg != null ? fmt(m.weight_kg) + ' kg' : '' }}</b>
                <span class="tiny muted" style="display:block">{{ fmtDate(m.measured_at) }} · {{ sourceLabel(m.source) }}{{ m.bmi ? ' · BMI ' + m.bmi : '' }}</span>
              </span>
              <app-icon name="chevron-right" [size]="16" />
            </button>
          }
        </div>
      }
    </div>

    <app-sheet [open]="formOpen()" [title]="editing() ? 'Izmeni merenje' : 'Novo merenje'" (closed)="formOpen.set(false)">
      <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
        <img src="illustrations/measuring.png" alt="" class="form-ill" width="238" height="188" />
        <div class="summary small"><app-icon name="user" [size]="16" /> {{ children.selected()?.first_name }}</div>
        <div class="grid-2">
          <div class="field"><label for="g-d">Datum</label><input id="g-d" class="input" type="date" formControlName="date" [max]="today" /></div>
          <div class="field"><label for="g-t">Vreme</label><input id="g-t" class="input" type="time" formControlName="time" /></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="g-h">Visina</label><div class="input-group"><input id="g-h" class="input num" type="number" inputmode="decimal" step="0.1" formControlName="height" /><span class="addon">cm</span></div></div>
          <div class="field"><label for="g-w">Težina</label><div class="input-group"><input id="g-w" class="input num" type="number" inputmode="decimal" step="0.1" formControlName="weight" /><span class="addon">kg</span></div></div>
        </div>
        @if (bmiPreview()) { <p class="tiny muted">BMI (izračunato): {{ bmiPreview() }}</p> }
        <div class="field"><label for="g-hc">Obim glave (opciono)</label><div class="input-group"><input id="g-hc" class="input num" type="number" inputmode="decimal" step="0.1" formControlName="head" /><span class="addon">cm</span></div></div>
        <div class="field"><span class="label">Izvor</span>
          <div class="chips">@for (s of sources; track s.v) { <button type="button" class="chip" [attr.aria-pressed]="form.controls.source.value === s.v" (click)="form.controls.source.setValue(s.v)">{{ s.l }}</button> }</div>
        </div>
        <div class="field"><label for="g-n">Napomena (opciono)</label><input id="g-n" class="input" formControlName="note" maxlength="300" /></div>
        <div class="sheet-actions">
          <button class="btn primary lg block" type="submit" [disabled]="busy()">Sačuvaj merenje</button>
          @if (editing()) { <button class="btn danger-soft block" type="button" (click)="remove()"><app-icon name="trash" [size]="18" /> Obriši</button> }
        </div>
      </form>
    </app-sheet>`,
  styles: [`
    .hero { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; }
    .hero small { font-size: 15px; color: var(--text-2); font-weight: 600; }
    .hero-ill { order: 2; width: 72px; height: 72px; object-fit: cover; border-radius: 18px; }
    .form-ill { width: 100%; max-height: 130px; object-fit: cover; object-position: center 35%; border-radius: 18px; }
    .summary { display: flex; gap: 6px; align-items: center; padding: 8px 12px; background: var(--primary-softer); border-radius: 12px; font-weight: 600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthPage {
  readonly children = inject(ChildService);
  private readonly growth = inject(GrowthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly sources = SOURCES;
  readonly today = toLocalDate(new Date());
  readonly fmtDate = formatDate;

  readonly data = childData((id) => this.growth.list(id));
  readonly metric = signal<Metric>('height_cm');
  readonly formOpen = signal(false);
  readonly editing = signal<GrowthMeasurement | null>(null);
  readonly busy = signal(false);

  readonly form = inject(FormBuilder).group({
    date: [toLocalDate(new Date())], time: [toLocalTime(new Date())],
    height: [null as number | null], weight: [null as number | null], head: [null as number | null],
    source: ['home' as MeasurementSource], note: [''],
  });

  readonly availableMetrics = computed(() => METRICS.filter((m) => m.key !== 'head_circumference_cm' || (this.data.value() ?? []).some((x) => x.head_circumference_cm != null)));
  readonly current = computed(() => METRICS.find((m) => m.key === this.metric())!);
  readonly metricIllustration = computed(() => ({ height_cm: 'illustrations/f-growth.png', weight_kg: 'illustrations/f-weight.png', bmi: 'illustrations/f-charts.png', head_circumference_cm: 'illustrations/strong-boy.png' })[this.metric()]);
  readonly points = computed(() => series(this.data.value() ?? [], this.metric()));
  readonly latest = computed(() => this.points().at(-1) ?? null);
  readonly change = computed(() => lastChange(this.data.value() ?? [], this.metric()));
  readonly vel = computed(() => velocities(this.data.value() ?? []));
  readonly reversed = computed(() => [...(this.data.value() ?? [])].reverse());

  bmiPreview(): number | null {
    return bmi(this.form.value.height, this.form.value.weight);
  }

  fmt(n: number): string {
    return n.toLocaleString('sr-Latn', { maximumFractionDigits: 1 });
  }

  signed(n: number, unit: string): string {
    return formatSigned(n, unit);
  }

  sourceLabel(s: MeasurementSource): string {
    return SOURCES.find((x) => x.v === s)?.l ?? '';
  }

  openNew(): void {
    this.editing.set(null);
    this.form.reset({ date: toLocalDate(new Date()), time: toLocalTime(new Date()), height: null, weight: null, head: null, source: 'home', note: '' });
    this.formOpen.set(true);
  }

  openEdit(m: GrowthMeasurement): void {
    this.editing.set(m);
    const d = new Date(m.measured_at);
    this.form.reset({ date: toLocalDate(d), time: toLocalTime(d), height: m.height_cm, weight: m.weight_kg, head: m.head_circumference_cm, source: m.source, note: m.note ?? '' });
    this.formOpen.set(true);
  }

  async save(): Promise<void> {
    const childId = this.children.selectedChildId();
    if (!childId) return;
    const v = this.form.getRawValue();
    const num = (x: number | null) => (x === null || x === undefined || (x as unknown) === '' ? null : Number(x));
    const input = {
      measured_at: combineLocal(v.date!, v.time || '12:00').toISOString(), height_cm: num(v.height), weight_kg: num(v.weight),
      head_circumference_cm: num(v.head), source: v.source ?? 'home', note: v.note?.trim() || null,
    };
    this.busy.set(true);
    try {
      const e = this.editing();
      if (e) await this.growth.update(e, input);
      else await this.growth.add(childId, input);
      this.formOpen.set(false);
      this.toast.success('Merenje je sačuvano.');
    } catch (err) {
      this.toast.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const e = this.editing();
    if (!e) return;
    if (!(await this.confirm.ask({ title: 'Obrisati merenje?', message: `Merenje od ${formatDate(e.measured_at)} biće obrisano.`, danger: true, confirmText: 'Obriši' }))) return;
    try {
      await this.growth.remove(e.id);
      this.formOpen.set(false);
      this.toast.success('Merenje je obrisano.');
    } catch (err) {
      this.toast.error(err);
    }
  }
}
