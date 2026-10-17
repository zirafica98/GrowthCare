import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { LabResultInput, LabService, LabTestWithResults, normalizeTestName } from '../../core/services/lab.service';
import { ReminderService } from '../../core/services/reminder.service';
import { ToastService } from '../../core/services/toast.service';
import { combineLocal, formatDate, toLocalDate } from '../../core/utils/dates';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { LineChartComponent } from '../../shared/ui/line-chart.component';
import { SheetComponent } from '../../shared/ui/sheet.component';

const COMMON_TESTS = ['IGF-1', 'IGF-BP3', 'TSH', 'FT4', 'GH', 'Glukoza', 'HbA1c', 'Kortizol', 'Feritin', 'Hemoglobin'];

@Component({
  selector: 'app-laboratory-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, SheetComponent, LineChartComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Laboratorija" [subtitle]="children.selected()?.first_name ?? ''">
        <button class="btn primary sm" type="button" (click)="openNew()"><app-icon name="plus" [size]="18" /> Unos</button>
      </app-page-header>
      <div class="segmented" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'results'" (click)="tab.set('results')">Rezultati</button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'charts'" (click)="tab.set('charts')">Grafici</button>
      </div>
      <div style="height:12px"></div>

      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <app-loading [rows]="4" [height]="64" />
      } @else if (!(data.value()?.length)) {
        <app-empty-state title="Nema laboratorijskih nalaza" text="Unesite rezultate ručno ili fotografišite nalaz u Dokumentima." image="illustrations/f-lab.png">
          <div class="row"><button class="btn primary" type="button" (click)="openNew()">Unesi ručno</button><a class="btn outline" routerLink="/app/documents">Fotografiši nalaz</a></div>
        </app-empty-state>
      } @else if (tab() === 'results') {
        <p class="tiny muted" style="margin:0 4px 10px">Vrednosti i referentni opsezi prikazani su kako su upisani sa nalaza. Aplikacija ih ne tumači.</p>
        @for (t of data.value()!; track t.id) {
          <section class="card" style="margin-bottom:12px; padding:12px 14px">
            <div class="row between">
              <div><b>{{ fmt(t.collected_at) }}</b><div class="tiny muted">{{ t.laboratory || 'Laboratorija' }}</div></div>
              <div class="row" style="gap:2px">
                @if (t.document_id) { <a class="icon-btn" [routerLink]="['/app/documents', t.document_id]" aria-label="Originalni dokument"><app-icon name="file" [size]="18" /></a> }
                <button class="icon-btn" type="button" (click)="removeTest(t)" aria-label="Obriši nalaz"><app-icon name="trash" [size]="18" /></button>
              </div>
            </div>
            @for (r of t.results; track r.id) {
              <button class="res" type="button" (click)="showChart(r.test_name)">
                <span class="dot" aria-hidden="true"></span>
                <span class="grow"><b class="small">{{ r.test_name }}</b>
                  @if (r.reference_range) { <span class="tiny muted"> · ref. {{ r.reference_range }}</span> }</span>
                <span class="num strong">{{ r.result_value }}</span><span class="tiny muted unit">{{ r.unit }}</span>
                @if (r.flag) { <span class="badge warning" title="Oznaka sa nalaza">{{ r.flag }}</span> }
                @if (!r.verified) { <span class="badge">nepotvrđeno</span> }
              </button>
            }
            @if (t.notes) { <p class="small muted" style="margin-top:6px">{{ t.notes }}</p> }
          </section>
        }
      } @else {
        <div class="chips" style="margin-bottom:12px">
          @for (n of testNames(); track n) { <button type="button" class="chip" [attr.aria-pressed]="chartTest() === n" (click)="chartTest.set(n)">{{ n }}</button> }
        </div>
        @if (!chartPoints().length || !chartTest()) {
          <div class="row" style="margin-bottom:10px"><img src="illustrations/f-charts.png" alt="" width="64" height="64" style="border-radius:14px" /><p class="small muted grow">Izaberite analizu da vidite kako se vrednost menjala kroz vreme.</p></div>
        }
        @if (chartPoints().length) {
          <section class="card">
            <div class="card-title">{{ chartTest() }} ({{ chartUnit() }})</div>
            <app-line-chart [points]="chartPoints()" [unit]="chartUnit()" [label]="chartTest()" color="#6d5bd0" [decimals]="2" />
            <table class="table" style="margin-top:8px">
              <tbody>@for (p of chartPoints().slice().reverse(); track p.date) { <tr><td class="small">{{ fmt(p.date) }}</td><td class="num">{{ p.value }} {{ chartUnit() }}</td></tr> }</tbody>
            </table>
          </section>
        } @else { <p class="muted small">Izaberite analizu sa numeričkim vrednostima.</p> }
      }
    </div>

    <app-sheet [open]="formOpen()" title="Novi laboratorijski nalaz" (closed)="formOpen.set(false)">
      <div class="stack">
        <div class="grid-2">
          <div class="field"><label for="l-date">Datum uzorkovanja</label><input id="l-date" class="input" type="date" [(ngModel)]="date" /></div>
          <div class="field"><label for="l-lab">Laboratorija</label><input id="l-lab" class="input" [(ngModel)]="laboratory" /></div>
        </div>
        @for (r of rows; track $index; let i = $index) {
          <div class="card flat tight stack sm">
            <div class="row"><input class="input" [(ngModel)]="r.test_name" list="tests" placeholder="Analiza (npr. IGF-1)" [attr.aria-label]="'Analiza ' + (i + 1)" />
              <button class="icon-btn" type="button" (click)="rows.splice(i, 1)" aria-label="Ukloni red"><app-icon name="x" [size]="18" /></button></div>
            <div class="grid-3">
              <input class="input num" [(ngModel)]="r.result_value" placeholder="Vrednost" inputmode="decimal" aria-label="Vrednost" />
              <input class="input" [(ngModel)]="r.unit" placeholder="Jedinica" aria-label="Jedinica" />
              <input class="input" [(ngModel)]="r.reference_range" placeholder="Ref. opseg" aria-label="Referentni opseg" />
            </div>
            <input class="input" [(ngModel)]="r.flag" placeholder="Oznaka sa nalaza (H/L), ako postoji" aria-label="Oznaka" />
          </div>
        }
        <datalist id="tests">@for (t of common; track t) { <option [value]="t"></option> }</datalist>
        <button class="btn ghost" type="button" (click)="addRow()"><app-icon name="plus" [size]="16" /> Dodaj analizu</button>
        <div class="field"><label for="l-notes">Napomena</label><input id="l-notes" class="input" [(ngModel)]="notes" /></div>
        <label class="check"><input type="checkbox" [(ngModel)]="remind" /> <span class="small">Podseti me dan ranije (ako je datum u budućnosti)</span></label>
        <div class="sheet-actions"><button class="btn primary lg block" type="button" [disabled]="busy()" (click)="save()">Sačuvaj nalaz</button></div>
      </div>
    </app-sheet>`,
  styles: [`
    .res { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 2px; border: 0; border-bottom: 1px solid var(--border); background: none; text-align: left; cursor: pointer; color: inherit; }
    .res:last-of-type { border-bottom: 0; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--violet); flex: 0 0 auto; }
    .unit { min-width: 44px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaboratoryPage {
  readonly children = inject(ChildService);
  private readonly labs = inject(LabService);
  private readonly reminders = inject(ReminderService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly common = COMMON_TESTS;
  readonly tab = signal<'results' | 'charts'>('results');
  readonly formOpen = signal(false);
  readonly busy = signal(false);
  readonly chartTest = signal('');
  readonly data = childData((id) => this.labs.list(id));
  readonly fmt = formatDate;

  date = toLocalDate(new Date());
  laboratory = '';
  notes = '';
  remind = false;
  rows: LabResultInput[] = [];

  readonly testNames = computed(() => {
    const seen = new Map<string, string>();
    for (const t of this.data.value() ?? []) for (const r of t.results) if (r.result_numeric != null) seen.set(normalizeTestName(r.test_name), r.test_name);
    return [...seen.values()];
  });
  readonly chartSeries = computed(() => this.labs.history(this.data.value() ?? [], this.chartTest() || this.testNames()[0] || ''));
  readonly chartPoints = computed(() => this.chartSeries().map((p) => ({ date: p.date, value: p.value })));
  readonly chartUnit = computed(() => this.chartSeries().at(-1)?.unit ?? '');

  showChart(name: string): void {
    this.chartTest.set(name);
    this.tab.set('charts');
  }

  addRow(): void {
    this.rows.push({ test_name: '', result_value: '', unit: '', reference_range: '', flag: '' });
  }

  openNew(): void {
    this.date = toLocalDate(new Date());
    this.laboratory = '';
    this.notes = '';
    this.remind = false;
    this.rows = [];
    this.addRow();
    this.formOpen.set(true);
  }

  async save(): Promise<void> {
    const childId = this.children.selectedChildId();
    if (!childId) return;
    this.busy.set(true);
    try {
      const t = await this.labs.create(childId, { collected_at: combineLocal(this.date, '08:00').toISOString(), laboratory: this.laboratory.trim() || null, notes: this.notes.trim() || null }, this.rows);
      if (this.remind) await this.reminders.setLabReminder(t, true);
      this.formOpen.set(false);
      this.toast.success('Nalaz je sačuvan.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async removeTest(t: LabTestWithResults): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Obrisati nalaz?', message: `Nalaz od ${formatDate(t.collected_at)} sa ${t.results.length} rezultata biće obrisan. Originalni dokument ostaje u Dokumentima.`, danger: true, confirmText: 'Obriši' }))) return;
    try {
      await this.labs.removeTest(t.id);
      this.toast.success('Nalaz je obrisan.');
    } catch (e) {
      this.toast.error(e);
    }
  }
}
