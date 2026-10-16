import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { q } from '../data/query';
import { DoctorVisit, LabTest, Medication, Reminder, ReminderType } from '../models/models';
import { addDays, combineLocal, toLocalDate } from '../utils/dates';
import { parseFrequency } from '../utils/dose-schedule';
import { buildRule } from '../utils/recurrence';
import { uuid } from '../utils/uuid';

export const REMINDER_TYPE_LABEL: Record<ReminderType, string> = {
  dose: 'Doza',
  missed_dose: 'Propuštena doza',
  appointment: 'Kontrola',
  laboratory: 'Laboratorija',
  measurement: 'Merenje',
  stock: 'Nabavka terapije',
  custom: 'Podsetnik',
};

/** Appointment reminder presets: offset in days before the visit (0 = day of, at 08:00). */
export const VISIT_PRESETS = [
  { key: '7d', days: 7, label: '7 dana ranije' },
  { key: '1d', days: 1, label: '1 dan ranije' },
  { key: '0d', days: 0, label: 'Na dan kontrole' },
] as const;

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  list(childId: string): Promise<Reminder[]> {
    return this.data.list<Reminder>('reminders', q().eq('child_id', childId).orderBy('scheduled_for'));
  }

  listForChildren(childIds: string[]): Promise<Reminder[]> {
    if (!childIds.length) return Promise.resolve([]);
    return this.data.list<Reminder>('reminders', q().in('child_id', childIds).orderBy('scheduled_for'));
  }

  async save(r: Partial<Reminder> & Pick<Reminder, 'child_id' | 'type' | 'title' | 'scheduled_for'>): Promise<Reminder> {
    if (r.id && r.created_at) return this.data.update<Reminder>('reminders', r.id, r);
    const row: Reminder = {
      id: r.id ?? uuid(), child_id: r.child_id, type: r.type, title: r.title, description: r.description ?? null,
      scheduled_for: r.scheduled_for, recurrence_rule: r.recurrence_rule ?? null, related_entity_type: r.related_entity_type ?? null,
      related_entity_id: r.related_entity_id ?? null, enabled: r.enabled ?? true, created_by: this.auth.user()?.id ?? '',
      created_at: new Date().toISOString(),
    };
    return this.data.insert('reminders', row);
  }

  setEnabled(r: Reminder, enabled: boolean): Promise<Reminder> {
    return this.data.update<Reminder>('reminders', r.id, { enabled });
  }

  remove(id: string): Promise<void> {
    return this.data.remove('reminders', id);
  }

  async forEntity(type: string, id: string): Promise<Reminder[]> {
    return this.data.list<Reminder>('reminders', q().eq('related_entity_type', type).eq('related_entity_id', id));
  }

  /** Keep exactly one daily dose reminder per medication, matching its schedule. */
  async ensureDoseReminder(med: Medication): Promise<void> {
    const existing = (await this.forEntity('medication', med.id)).filter((r) => r.type === 'dose');
    if (!med.active) {
      for (const r of existing) await this.data.update<Reminder>('reminders', r.id, { enabled: false });
      return;
    }
    const f = parseFrequency(med.frequency);
    const rule = f.kind === 'daily' ? buildRule('DAILY') : buildRule('WEEKLY', 1, f.days);
    const start = combineLocal(med.start_date && med.start_date > toLocalDate(new Date()) ? med.start_date : toLocalDate(new Date()), med.scheduled_time);
    const patch = { title: `${med.name} — ${med.current_dose} ${med.dose_unit}`, scheduled_for: start.toISOString(), recurrence_rule: rule };
    if (existing[0]) {
      await this.data.update<Reminder>('reminders', existing[0].id, patch);
    } else {
      await this.save({ child_id: med.child_id, type: 'dose', related_entity_type: 'medication', related_entity_id: med.id, ...patch });
    }
  }

  /** Replace the preset reminders of a visit with the selected ones. */
  async setVisitReminders(visit: DoctorVisit, presetKeys: string[], label: string): Promise<void> {
    const existing = await this.forEntity('doctor_visit', visit.id);
    for (const r of existing) await this.remove(r.id);
    if (visit.status !== 'scheduled') return;
    const at = new Date(visit.scheduled_at);
    for (const p of VISIT_PRESETS.filter((x) => presetKeys.includes(x.key))) {
      const when = p.days === 0 ? combineLocal(toLocalDate(at), '08:00') : addDays(at, -p.days);
      if (when < new Date()) continue;
      await this.save({
        child_id: visit.child_id, type: 'appointment', title: `${label} — ${p.label.toLowerCase()}`,
        scheduled_for: when.toISOString(), related_entity_type: 'doctor_visit', related_entity_id: visit.id,
        description: p.key,
      });
    }
  }

  async visitPresetKeys(visitId: string): Promise<string[]> {
    return (await this.forEntity('doctor_visit', visitId)).map((r) => r.description ?? '').filter(Boolean);
  }

  async setLabReminder(test: LabTest, enabled: boolean): Promise<void> {
    const existing = await this.forEntity('lab_test', test.id);
    for (const r of existing) await this.remove(r.id);
    if (!enabled) return;
    const when = addDays(new Date(test.collected_at), -1);
    if (when < new Date()) return;
    await this.save({
      child_id: test.child_id, type: 'laboratory', title: `Laboratorija sutra${test.laboratory ? ` — ${test.laboratory}` : ''}`,
      scheduled_for: when.toISOString(), related_entity_type: 'lab_test', related_entity_id: test.id,
    });
  }
}
