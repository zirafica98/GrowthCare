import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Medication, MedicationStock, TherapySource } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { DocumentService } from '../../core/services/document.service';
import { DoseService } from '../../core/services/dose.service';
import { NewMedicationInput, TherapyService } from '../../core/services/therapy.service';
import { ToastService } from '../../core/services/toast.service';
import { VisitService } from '../../core/services/visit.service';
import { addDays, formatDate, formatDateTime, startOfDay, toLocalDate } from '../../core/utils/dates';
import { expectedSlots, frequencyLabel } from '../../core/utils/dose-schedule';
import { uuid } from '../../core/utils/uuid';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';
import { MedicationFormComponent } from './medication-form.component';

@Component({
  selector: 'app-therapy-page',
  imports: [FormsModule, PageHeaderComponent, IconComponent, SheetComponent, MedicationFormComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  templateUrl: './therapy.page.html',
  styles: [`
    .hero-dose { font-size: 30px; font-weight: 750; letter-spacing: -0.02em; }
    .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
    .kv .k { font-size: 12.5px; color: var(--text-2); }
    .kv .v { font-weight: 650; }
    .meter { height: 8px; border-radius: 99px; background: #eef2f7; overflow: hidden; }
    .meter span { display: block; height: 100%; background: linear-gradient(90deg, var(--primary-tint), var(--primary)); }
    .meter.low span { background: var(--warning-accent); }
    .change { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .change:last-child { border-bottom: 0; }
    .dot { width: 12px; height: 12px; border-radius: 50%; border: 3px solid var(--border-strong); flex: 0 0 auto; }
    .dot.current { border-color: var(--success-accent); background: var(--success-soft); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TherapyPage implements OnInit {
  readonly children = inject(ChildService);
  private readonly therapy = inject(TherapyService);
  private readonly doses = inject(DoseService);
  private readonly visits = inject(VisitService);
  private readonly docs = inject(DocumentService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  /** Prefill from OCR review: /app/therapy?newDose=0.4&documentId=… */
  readonly newDose = input<string>('');
  readonly documentId = input<string>('');

  readonly fmtDate = formatDate;
  readonly fmtDateTime = formatDateTime;
  readonly freqLabel = frequencyLabel;
  readonly tab = signal<'current' | 'history'>('current');
  readonly medForm = signal<'new' | Medication | null>(null);
  readonly changeOpen = signal(false);
  readonly stockOpen = signal<MedicationStock | null>(null);
  readonly busy = signal(false);

  readonly data = childData(async (id) => {
    const [meds, changes, stock, injections, visits, documents] = await Promise.all([
      this.therapy.medications(id), this.therapy.changes(id), this.therapy.stock(id),
      this.doses.injections(id, addDays(startOfDay(new Date()), -400)), this.visits.list(id), this.docs.list(id),
    ]);
    return { meds, changes, stock, injections, visits, documents };
  });

  readonly active = computed(() => this.data.value()?.meds.filter((m) => m.active) ?? []);
  readonly inactive = computed(() => this.data.value()?.meds.filter((m) => !m.active) ?? []);
  readonly selectedMed = signal<string | null>(null);
  readonly med = computed<Medication | null>(() => this.active().find((m) => m.id === this.selectedMed()) ?? this.active()[0] ?? null);

  /** Dose periods derived from the change log: "0.6 mg 01.03.–31.08." */
  readonly periods = computed(() => {
    const m = this.med();
    const list = (this.data.value()?.changes ?? []).filter((c) => c.medication_id === m?.id).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    return list.map((c, i) => ({
      change: c, from: c.changed_at, to: list[i + 1] ? toLocalDate(addDays(new Date(`${list[i + 1].changed_at}T12:00:00`), -1)) : null, current: i === list.length - 1,
    })).reverse();
  });

  readonly nextDose = computed(() => {
    const m = this.med();
    const d = this.data.value();
    if (!m || !d) return null;
    const now = new Date();
    return expectedSlots([m], d.injections, now, addDays(now, 7)).find((s) => s.status === 'pending') ?? null;
  });

  readonly stockInfo = computed(() => {
    const m = this.med();
    const d = this.data.value();
    if (!m || !d) return [];
    return d.stock.filter((s) => s.medication_id === m.id).map((s) => {
      const est = this.therapy.estimate(s, m, d.injections);
      const total = s.total_amount * Math.max(1, s.quantity);
      return { s, est, pct: total ? Math.round((est.remaining / total) * 100) : 0, expiryDays: this.therapy.daysUntilExpiry(s) };
    });
  });

  // change form
  cNewDose: number | null = null;
  cDate = toLocalDate(new Date());
  cSource: TherapySource = 'doctor_visit';
  cVisit = '';
  cDoc = '';
  cNote = '';

  // stock form
  sName = '';
  sTotal: number | null = null;
  sQty = 1;
  sOpened = toLocalDate(new Date());
  sExpires = '';
  sThreshold = 7;

  ngOnInit(): void {
    if (this.newDose()) {
      // Opened from a verified document: prefill but still require explicit confirmation.
      this.cNewDose = Number(this.newDose());
      this.cSource = this.documentId() ? 'document' : 'manual';
      this.cDoc = this.documentId();
      setTimeout(() => this.changeOpen.set(true), 300);
    }
  }

  fmt(n: number | null | undefined): string {
    return n == null ? '—' : n.toLocaleString('sr-Latn', { maximumFractionDigits: 3 });
  }

  async addMedication(v: NewMedicationInput): Promise<void> {
    const childId = this.children.selectedChildId();
    if (!childId) return;
    await this.run(async () => {
      const current = this.medForm();
      if (current && current !== 'new') await this.therapy.updateMedication(current.id, { ...v, current_dose: undefined } as Partial<Medication>);
      else await this.therapy.addMedication(childId, v);
      this.medForm.set(null);
      this.toast.success('Terapija je sačuvana.');
    });
  }

  openChange(): void {
    if (!this.newDose()) {
      this.cNewDose = null;
      this.cDate = toLocalDate(new Date());
      this.cSource = 'doctor_visit';
      this.cNote = '';
    }
    const recent = (this.data.value()?.visits ?? []).filter((v) => Date.parse(v.scheduled_at) <= Date.now()).at(-1);
    this.cVisit = recent?.id ?? '';
    this.changeOpen.set(true);
  }

  async saveChange(): Promise<void> {
    const m = this.med();
    if (!m || !this.cNewDose) return;
    const ok = await this.confirm.ask({
      title: 'Potvrdite promenu doze',
      message: `Beleži se doza koju je propisao lekar za ${this.children.selected()?.first_name}. Aplikacija ne predlaže doze.`,
      details: [
        { label: 'Lek', value: m.name },
        { label: 'Prethodna doza', value: `${this.fmt(m.current_dose)} ${m.dose_unit}` },
        { label: 'Nova doza', value: `${this.fmt(this.cNewDose)} ${m.dose_unit}` },
        { label: 'Od datuma', value: formatDate(this.cDate) },
      ],
      confirmText: 'Sačuvaj promenu',
    });
    if (!ok) return;
    await this.run(async () => {
      await this.therapy.changeDose(m, {
        newDose: Number(this.cNewDose), changedAt: this.cDate, source: this.cSource,
        visitId: this.cSource === 'doctor_visit' ? this.cVisit || null : null,
        documentId: this.cSource === 'document' ? this.cDoc || null : null, note: this.cNote.trim() || null,
      });
      this.changeOpen.set(false);
      this.toast.success(`Zabeležena doza je promenjena sa ${this.fmt(m.current_dose)} na ${this.fmt(this.cNewDose)} ${m.dose_unit}.`);
    });
  }

  async stop(m: Medication): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Završiti terapiju?', message: `${m.name} će biti označen kao neaktivan od danas. Istorija doza ostaje sačuvana.`,
      confirmText: 'Završi terapiju', danger: true,
    });
    if (!ok) return;
    await this.run(() => this.therapy.stopMedication(m, toLocalDate(new Date())).then(() => this.toast.success('Terapija je završena.')));
  }

  openStock(s: MedicationStock | null): void {
    const m = this.med();
    if (!m) return;
    const blank: MedicationStock = {
      id: uuid(), medication_id: m.id, child_id: m.child_id, package_name: `${m.name}${m.strength ? ' ' + m.strength : ''}`, strength: m.strength,
      total_amount: 0, quantity: 1, opened_at: toLocalDate(new Date()), refill_date: null, expires_at: null, reminder_threshold_days: 7, note: null, created_at: '',
    };
    const row = s ?? blank;
    this.sName = row.package_name;
    this.sTotal = row.total_amount || null;
    this.sQty = row.quantity;
    this.sOpened = row.opened_at ?? toLocalDate(new Date());
    this.sExpires = row.expires_at ?? '';
    this.sThreshold = row.reminder_threshold_days;
    this.stockOpen.set(row);
  }

  async saveStock(): Promise<void> {
    const row = this.stockOpen();
    if (!row || !this.sTotal) return;
    await this.run(async () => {
      await this.therapy.saveStock({
        ...row, package_name: this.sName.trim() || row.package_name, total_amount: Number(this.sTotal), quantity: Math.max(1, Number(this.sQty) || 1),
        opened_at: this.sOpened || null, expires_at: this.sExpires || null, reminder_threshold_days: Number(this.sThreshold) || 7,
      });
      this.stockOpen.set(null);
      this.toast.success('Zaliha je sačuvana.');
    });
  }

  async removeStock(): Promise<void> {
    const row = this.stockOpen();
    if (!row?.created_at) return;
    await this.run(async () => {
      await this.therapy.removeStock(row.id);
      this.stockOpen.set(null);
    });
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
