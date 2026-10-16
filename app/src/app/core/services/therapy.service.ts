import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { appError } from '../data/errors';
import { q } from '../data/query';
import { Injection, Medication, MedicationStock, TherapyChange, TherapySource } from '../models/models';
import { addDays, parseLocalDate, toLocalDate } from '../utils/dates';
import { round } from '../utils/dose-schedule';
import { uuid } from '../utils/uuid';
import { ReminderService } from './reminder.service';

export interface NewMedicationInput {
  name: string;
  substance?: string | null;
  strength?: string | null;
  current_dose: number;
  dose_unit: string;
  frequency: string;
  scheduled_time: string;
  start_date: string;
  prescribing_doctor?: string | null;
  notes?: string | null;
}

export interface DoseChangeInput {
  newDose: number;
  changedAt: string;
  source: TherapySource;
  documentId?: string | null;
  visitId?: string | null;
  note?: string | null;
}

export interface StockEstimate {
  usedSinceOpened: number;
  remaining: number;
  daysLeft: number | null;
  runsOutOn: string | null;
}

/**
 * Therapy records. The app only stores what the parent enters from the
 * prescription — it never proposes or adjusts a dose.
 */
@Injectable({ providedIn: 'root' })
export class TherapyService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly reminders = inject(ReminderService);

  medications(childId: string): Promise<Medication[]> {
    return this.data.list<Medication>('medications', q().eq('child_id', childId).orderBy('start_date', false));
  }

  changes(childId: string): Promise<TherapyChange[]> {
    return this.data.list<TherapyChange>('therapy_changes', q().eq('child_id', childId).orderBy('changed_at', false).orderBy('created_at', false));
  }

  async addMedication(childId: string, input: NewMedicationInput): Promise<Medication> {
    if (!(input.current_dose > 0)) throw appError('validation', null, 'Unesite dozu koju je propisao lekar.');
    const now = new Date().toISOString();
    const med: Medication = {
      id: uuid(), child_id: childId, name: input.name.trim(), substance: input.substance ?? null, strength: input.strength ?? null,
      unit: null, active: true, start_date: input.start_date, end_date: null, current_dose: input.current_dose,
      dose_unit: input.dose_unit, frequency: input.frequency, scheduled_time: input.scheduled_time,
      prescribing_doctor: input.prescribing_doctor ?? null, notes: input.notes ?? null, created_at: now, updated_at: now,
    };
    const saved = await this.data.insert('medications', med);
    await this.data.insert<TherapyChange>('therapy_changes', {
      id: uuid(), medication_id: saved.id, child_id: childId, previous_dose: null, new_dose: saved.current_dose,
      dose_unit: saved.dose_unit, changed_at: saved.start_date ?? toLocalDate(new Date()), source_type: 'manual',
      source_document_id: null, doctor_visit_id: null, note: 'Početak terapije', created_by: this.uid(), created_at: now,
    });
    await this.reminders.ensureDoseReminder(saved);
    return saved;
  }

  async updateMedication(id: string, patch: Partial<Medication>): Promise<Medication> {
    // Dose changes must go through changeDose() so they are traceable.
    const { current_dose: _d, child_id: _c, id: _id, ...safe } = patch;
    const saved = await this.data.update<Medication>('medications', id, safe);
    await this.reminders.ensureDoseReminder(saved);
    return saved;
  }

  /** Explicit, parent-entered dose change. Stored with previous/new values and its source. */
  async changeDose(med: Medication, input: DoseChangeInput): Promise<TherapyChange> {
    if (!(input.newDose > 0)) throw appError('validation', null, 'Unesite novu zabeleženu dozu.');
    if (input.newDose === med.current_dose) throw appError('validation', null, 'Nova doza je ista kao trenutna.');
    const change: TherapyChange = {
      id: uuid(), medication_id: med.id, child_id: med.child_id, previous_dose: med.current_dose, new_dose: input.newDose,
      dose_unit: med.dose_unit, changed_at: input.changedAt, source_type: input.source,
      source_document_id: input.documentId ?? null, doctor_visit_id: input.visitId ?? null, note: input.note ?? null,
      created_by: this.uid(), created_at: new Date().toISOString(),
    };
    const saved = await this.data.insert('therapy_changes', change);
    await this.data.update<Medication>('medications', med.id, { current_dose: input.newDose });
    return saved;
  }

  async stopMedication(med: Medication, endDate: string): Promise<Medication> {
    const saved = await this.data.update<Medication>('medications', med.id, { active: false, end_date: endDate });
    await this.reminders.ensureDoseReminder(saved);
    return saved;
  }

  // ---- stock

  stock(childId: string): Promise<MedicationStock[]> {
    return this.data.list<MedicationStock>('medication_stock', q().eq('child_id', childId).orderBy('created_at', false));
  }

  saveStock(row: MedicationStock): Promise<MedicationStock> {
    return row.created_at ? this.data.update<MedicationStock>('medication_stock', row.id, row) : this.data.insert('medication_stock', { ...row, created_at: new Date().toISOString() });
  }

  removeStock(id: string): Promise<void> {
    return this.data.remove('medication_stock', id);
  }

  /**
   * ESTIMATE of what is left, from manually recorded doses since the package
   * was opened. Labelled as an estimate in the UI.
   */
  estimate(stock: MedicationStock, med: Medication, injections: Injection[], today = new Date()): StockEstimate {
    const opened = stock.opened_at ?? stock.created_at?.slice(0, 10) ?? toLocalDate(today);
    const used = injections
      .filter((i) => i.medication_id === med.id && i.status === 'given' && i.dose != null && i.administered_at && toLocalDate(new Date(i.administered_at)) >= opened)
      .reduce((s, i) => s + (i.dose ?? 0), 0);
    const total = stock.total_amount * Math.max(1, stock.quantity);
    const remaining = Math.max(0, round(total - used, 3));
    const daily = med.active ? med.current_dose * (med.frequency === 'daily' ? 1 : (med.frequency.split(',').length || 1) / 7) : 0;
    const daysLeft = daily > 0 ? Math.floor(remaining / daily) : null;
    return {
      usedSinceOpened: round(used, 3),
      remaining,
      daysLeft,
      runsOutOn: daysLeft !== null ? toLocalDate(addDays(today, daysLeft)) : null,
    };
  }

  daysUntilExpiry(stock: MedicationStock, today = new Date()): number | null {
    if (!stock.expires_at) return null;
    return Math.round((parseLocalDate(stock.expires_at).getTime() - parseLocalDate(toLocalDate(today)).getTime()) / 86_400_000);
  }

  private uid(): string {
    return this.auth.user()?.id ?? '';
  }
}
