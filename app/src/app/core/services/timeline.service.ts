import { inject, Injectable } from '@angular/core';
import {
  DoctorVisit, GrowthMeasurement, Injection, MedicalDocument, Medication, MedicationStock, Reminder, TherapyChange,
} from '../models/models';
import { formatDate, MONTHS_EN, MONTHS_SR, MONTHS_SR_GEN } from '../utils/dates';
import { DocumentService, CATEGORY_LABEL } from './document.service';
import { DoseService } from './dose.service';
import { FamilyService } from './family.service';
import { GrowthService } from './growth.service';
import { LabService, LabTestWithResults } from './lab.service';
import { ReminderService } from './reminder.service';
import { TherapyService } from './therapy.service';
import { VisitService } from './visit.service';

export type TimelineType = 'injection' | 'skipped' | 'measurement' | 'visit' | 'lab' | 'document' | 'therapy' | 'reminder';

export interface TimelineEvent {
  id: string;
  type: TimelineType;
  date: string; // ISO
  title: string;
  subtitle: string;
  badge?: { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' };
  link: string;
  /** Extra searchable text (never shown). */
  search?: string;
}

export const TIMELINE_LABEL: Record<TimelineType, string> = {
  injection: 'Doze', skipped: 'Nije dato', measurement: 'Merenja', visit: 'Kontrole', lab: 'Laboratorija',
  document: 'Dokumenti', therapy: 'Terapija', reminder: 'Podsetnici',
};

export interface ChildSnapshot {
  medications: Medication[];
  injections: Injection[];
  changes: TherapyChange[];
  measurements: GrowthMeasurement[];
  visits: DoctorVisit[];
  labs: LabTestWithResults[];
  documents: MedicalDocument[];
  reminders: Reminder[];
  stock: MedicationStock[];
}

function fmtNum(n: number | null | undefined): string {
  return n == null ? '' : n.toLocaleString('sr-Latn', { maximumFractionDigits: 2 });
}

/** Builds the unified chronological timeline and powers global search. */
@Injectable({ providedIn: 'root' })
export class TimelineService {
  private readonly doses = inject(DoseService);
  private readonly therapy = inject(TherapyService);
  private readonly growth = inject(GrowthService);
  private readonly visits = inject(VisitService);
  private readonly labs = inject(LabService);
  private readonly docs = inject(DocumentService);
  private readonly reminders = inject(ReminderService);
  private readonly family = inject(FamilyService);

  async snapshot(childId: string): Promise<ChildSnapshot> {
    const [medications, injections, changes, measurements, visits, labs, documents, reminders, stock] = await Promise.all([
      this.doses.medications(childId),
      this.doses.injections(childId),
      this.therapy.changes(childId),
      this.growth.list(childId),
      this.visits.list(childId),
      this.labs.list(childId),
      this.docs.list(childId),
      this.reminders.list(childId),
      this.therapy.stock(childId),
    ]);
    return { medications, injections, changes, measurements, visits, labs, documents, reminders, stock };
  }

  build(s: ChildSnapshot): TimelineEvent[] {
    const medName = (id: string) => s.medications.find((m) => m.id === id)?.name ?? 'Terapija';
    const out: TimelineEvent[] = [];

    for (const i of s.injections) {
      if (i.status === 'given') {
        out.push({
          id: i.id, type: 'injection', date: i.administered_at ?? i.scheduled_for, title: medName(i.medication_id),
          subtitle: `${fmtNum(i.dose)} ${i.dose_unit}${i.injection_site ? ` · ${i.injection_site}` : ''}${i.administered_by ? ` · ${this.family.memberName(i.administered_by)}` : ''}`,
          badge: { label: 'Dato', tone: 'success' }, link: '/app/history', search: `${i.note ?? ''}`,
        });
      } else if (i.status === 'skipped' || i.status === 'missed') {
        out.push({
          id: i.id, type: 'skipped', date: i.scheduled_for, title: medName(i.medication_id),
          subtitle: i.skip_reason ?? 'Nije zabeleženo', badge: { label: i.status === 'missed' ? 'Propušteno' : 'Nije dato', tone: 'warning' },
          link: '/app/history', search: i.note ?? '',
        });
      }
    }
    for (const m of s.measurements) {
      const parts = [m.height_cm != null ? `${fmtNum(m.height_cm)} cm` : '', m.weight_kg != null ? `${fmtNum(m.weight_kg)} kg` : ''].filter(Boolean);
      out.push({ id: m.id, type: 'measurement', date: m.measured_at, title: 'Merenje', subtitle: parts.join(' · '), link: '/app/growth', search: m.note ?? '' });
    }
    for (const v of s.visits) {
      const d = this.family.doctors().find((x) => x.id === v.doctor_id);
      out.push({
        id: v.id, type: 'visit', date: v.scheduled_at, title: `Kontrola — ${d?.specialty || d?.name || v.reason || 'lekar'}`,
        subtitle: [d?.name, d?.clinic].filter(Boolean).join(' · ') || (v.reason ?? ''),
        badge: v.status === 'completed' ? { label: 'Obavljeno', tone: 'success' } : v.status === 'cancelled' ? { label: 'Otkazano', tone: 'neutral' } : { label: 'Zakazano', tone: 'info' },
        link: `/app/doctors/${v.id}`, search: `${v.reason ?? ''} ${v.notes ?? ''} ${d?.name ?? ''} ${d?.specialty ?? ''} ${d?.clinic ?? ''}`,
      });
    }
    for (const t of s.labs) {
      out.push({
        id: t.id, type: 'lab', date: t.collected_at, title: `Laboratorija${t.laboratory ? ` — ${t.laboratory}` : ''}`,
        subtitle: t.results.slice(0, 4).map((r) => r.test_name).join(', ') + (t.results.length > 4 ? '…' : ''), link: '/app/laboratory',
        search: t.results.map((r) => `${r.test_name} ${r.result_value} ${r.unit ?? ''}`).join(' ') + ` ${t.notes ?? ''}`,
      });
    }
    for (const d of s.documents) {
      out.push({
        id: d.id, type: 'document', date: d.document_date ? `${d.document_date}T12:00:00` : d.created_at, title: d.title,
        subtitle: CATEGORY_LABEL[d.category], link: `/app/documents/${d.id}`, search: `${d.original_filename} ${d.tags.join(' ')} ${d.ocr_text ?? ''}`,
      });
    }
    for (const c of s.changes) {
      out.push({
        id: c.id, type: 'therapy', date: `${c.changed_at}T12:00:00`, title: c.previous_dose == null ? `Početak terapije — ${medName(c.medication_id)}` : 'Promena doze',
        subtitle: c.previous_dose == null ? `${fmtNum(c.new_dose)} ${c.dose_unit}` : `${fmtNum(c.previous_dose)} → ${fmtNum(c.new_dose)} ${c.dose_unit}`,
        link: '/app/therapy', search: `${c.note ?? ''} ${medName(c.medication_id)}`,
      });
    }
    for (const r of s.reminders.filter((x) => x.type === 'custom' || x.type === 'measurement')) {
      out.push({ id: r.id, type: 'reminder', date: r.scheduled_for, title: r.title, subtitle: r.description ?? 'Podsetnik', link: '/app/reminders' });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Global search across the timeline (documents incl. OCR text, visits, labs, therapy changes). */
  search(events: TimelineEvent[], query: string): TimelineEvent[] {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    return events.filter((e) => {
      const d = new Date(e.date);
      const hay = normalize([
        e.title, e.subtitle, e.search ?? '', TIMELINE_LABEL[e.type], formatDate(d),
        MONTHS_SR[d.getMonth()], MONTHS_SR_GEN[d.getMonth()], MONTHS_EN[d.getMonth()], String(d.getFullYear()),
      ].join(' '));
      return tokens.every((t) => hay.includes(t));
    });
  }
}

/** Lowercase, strip diacritics, unify decimal comma ("0,8 mg" ≈ "0.8 mg"). */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj').replace(/(\d),(\d)/g, '$1.$2');
}
