import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { TherapyService } from '../../core/services/therapy.service';
import { TimelineService } from '../../core/services/timeline.service';
import { VisitService } from '../../core/services/visit.service';
import { DoseService } from '../../core/services/dose.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { addDays, formatDate, formatDateTime, relativeDays, startOfDay, startOfWeek, toLocalTime } from '../../core/utils/dates';
import { doseStats, DoseSlot, expectedSlots } from '../../core/utils/dose-schedule';
import { changeOver, formatSigned, series } from '../../core/utils/growth';
import { nextOccurrence } from '../../core/utils/recurrence';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, MetricCardComponent, RingComponent, StatusBadgeComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { LineChartComponent } from '../../shared/ui/line-chart.component';
import { DoseSheetComponent } from '../doses/dose-sheet.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, IconComponent, RingComponent, MetricCardComponent, StatusBadgeComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent, LineChartComponent, DoseSheetComponent],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  readonly children = inject(ChildService);
  readonly family = inject(FamilyService);
  private readonly timeline = inject(TimelineService);
  private readonly therapy = inject(TherapyService);
  readonly visits = inject(VisitService);

  readonly snap = childData((id) => this.timeline.snapshot(id));
  readonly sheetSlot = signal<DoseSlot | null>(null);
  readonly quickBusy = signal(false);
  private readonly doses = inject(DoseService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  readonly sheetMode = signal<'give' | 'skip'>('give');

  readonly fmtDate = formatDate;
  readonly fmtDateTime = formatDateTime;
  readonly rel = (iso: string) => relativeDays(new Date(iso));
  readonly time = (iso: string | null) => (iso ? toLocalTime(new Date(iso)) : '');

  readonly today = computed(() => {
    const s = this.snap.value();
    if (!s) return [];
    const now = new Date();
    return expectedSlots(s.medications, s.injections, now, now);
  });

  readonly week = computed(() => {
    const s = this.snap.value();
    if (!s) return null;
    const now = new Date();
    return doseStats(expectedSlots(s.medications, s.injections, startOfWeek(now), now));
  });

  readonly activeMed = computed(() => this.snap.value()?.medications.find((m) => m.active) ?? null);
  readonly lastChange = computed(() => {
    const s = this.snap.value();
    const m = this.activeMed();
    return s && m ? s.changes.find((c) => c.medication_id === m.id && c.previous_dose != null) ?? null : null;
  });

  readonly growth = computed(() => {
    const list = this.snap.value()?.measurements ?? [];
    const h = series(list, 'height_cm');
    const w = series(list, 'weight_kg');
    const hc = changeOver(list, 'height_cm', 3);
    const wc = changeOver(list, 'weight_kg', 3);
    return {
      height: h.at(-1) ?? null, weight: w.at(-1) ?? null, heights: h.slice(-12),
      heightHint: hc ? `${formatSigned(hc.delta, 'cm')} (${Math.round(hc.days / 30)} mes.)` : '',
      weightHint: wc ? `${formatSigned(wc.delta, 'kg')} (${Math.round(wc.days / 30)} mes.)` : '',
    };
  });

  readonly nextVisit = computed(() => {
    const now = Date.now();
    return (this.snap.value()?.visits ?? []).filter((v) => v.status === 'scheduled' && Date.parse(v.scheduled_at) >= now)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;
  });

  readonly upcoming = computed(() => {
    const s = this.snap.value();
    if (!s) return [];
    const now = new Date();
    return s.reminders
      .filter((r) => r.enabled && r.type !== 'dose' && r.type !== 'appointment')
      .map((r) => ({ r, at: nextOccurrence(r, now) }))
      .filter((x): x is { r: typeof x.r; at: Date } => !!x.at)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 3);
  });

  /** Things that need a parent's attention (not medical advice). */
  readonly attention = computed(() => {
    const s = this.snap.value();
    if (!s) return [];
    const out: { icon: string; tone: string; text: string; link: string }[] = [];
    const now = new Date();
    const lastWeek = expectedSlots(s.medications, s.injections, addDays(startOfDay(now), -7), addDays(startOfDay(now), -1));
    const missed = lastWeek.filter((x) => x.status === 'missed').length;
    if (missed) out.push({ icon: 'alert', tone: 'warning', text: `${missed} ${missed === 1 ? 'doza nije zabeležena' : 'doze nisu zabeležene'} u poslednjih 7 dana`, link: '/app/history' });
    const review = s.documents.filter((d) => d.ocr_status === 'review').length;
    if (review) out.push({ icon: 'scan', tone: 'info', text: `${review} ${review === 1 ? 'dokument čeka' : 'dokumenta čekaju'} vašu proveru`, link: '/app/documents' });
    const failed = s.documents.filter((d) => d.ocr_status === 'failed').length;
    if (failed) out.push({ icon: 'file', tone: 'warning', text: `${failed} dokument(a) nije očitano — unesite podatke ručno`, link: '/app/documents' });
    const med = this.activeMed();
    for (const st of s.stock) {
      if (!med || st.medication_id !== med.id) continue;
      const est = this.therapy.estimate(st, med, s.injections, now);
      if (est.daysLeft !== null && est.daysLeft <= st.reminder_threshold_days) {
        out.push({ icon: 'package', tone: 'warning', text: `Zaliha leka: procena još ~${est.daysLeft} dana`, link: '/app/therapy' });
      }
    }
    return out;
  });

  readonly recent = computed(() => {
    const s = this.snap.value();
    return s ? this.timeline.build(s).filter((e) => Date.parse(e.date) <= Date.now()).slice(0, 5) : [];
  });

  /** One tap + "are you sure?" — records the prescribed dose now, by the signed-in parent. */
  async quickGive(slot: DoseSlot): Promise<void> {
    const child = this.children.selected();
    if (!child || slot.medication.child_id !== child.id) return;
    const m = slot.medication;
    const ok = await this.confirm.ask({
      title: 'Da li ste sigurni?',
      message: `Beleži se da je ${child.first_name} dobio/la današnju dozu.`,
      details: [
        { label: 'Dete', value: child.first_name },
        { label: 'Lek', value: m.name },
        { label: 'Doza', value: `${this.fmt(m.current_dose, 3)} ${m.dose_unit}` },
        { label: 'Termin', value: this.time(slot.scheduledFor) },
        { label: 'Dato u', value: toLocalTime(new Date()) },
      ],
      confirmText: 'Da, dao sam',
      cancelText: 'Ne',
    });
    if (!ok) return;
    this.quickBusy.set(true);
    try {
      await this.doses.give(slot, { dose: m.current_dose, administeredAt: new Date(), site: null, reaction: null, note: null, administeredBy: null }, child.id);
      this.toast.success(`Doza je zabeležena za ${child.first_name}.`);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.quickBusy.set(false);
      void this.snap.reload();
    }
  }

  open(slot: DoseSlot, mode: 'give' | 'skip' = 'give'): void {
    this.sheetMode.set(mode);
    this.sheetSlot.set(slot);
  }

  onSheetDone(changed: boolean): void {
    this.sheetSlot.set(null);
    if (changed) void this.snap.reload();
  }

  fmt(n: number | null | undefined, digits = 1): string {
    return n == null ? '' : n.toLocaleString('sr-Latn', { maximumFractionDigits: digits });
  }

  greeting(): string {
    const h = new Date().getHours();
    return h < 10 ? 'Dobro jutro' : h < 18 ? 'Dobar dan' : 'Dobro veče';
  }
}
