import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { q } from '../data/query';
import { DoctorVisit } from '../models/models';
import { uuid } from '../utils/uuid';
import { FamilyService } from './family.service';
import { ReminderService } from './reminder.service';

export const VISIT_STATUS_LABEL = { scheduled: 'Zakazano', completed: 'Obavljeno', cancelled: 'Otkazano' } as const;

@Injectable({ providedIn: 'root' })
export class VisitService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly family = inject(FamilyService);
  private readonly reminders = inject(ReminderService);

  list(childId: string): Promise<DoctorVisit[]> {
    return this.data.list<DoctorVisit>('doctor_visits', q().eq('child_id', childId).orderBy('scheduled_at'));
  }

  get(id: string): Promise<DoctorVisit | null> {
    return this.data.get<DoctorVisit>('doctor_visits', id);
  }

  label(v: DoctorVisit): string {
    const d = this.family.doctors().find((x) => x.id === v.doctor_id);
    return d?.specialty || d?.name || v.reason || 'Kontrola';
  }

  async save(input: Partial<DoctorVisit> & Pick<DoctorVisit, 'child_id' | 'scheduled_at'>, presetKeys: string[]): Promise<DoctorVisit> {
    const now = new Date().toISOString();
    let saved: DoctorVisit;
    if (input.id && input.created_at) {
      const { child_id: _c, ...patch } = input;
      saved = await this.data.update<DoctorVisit>('doctor_visits', input.id, patch);
    } else {
      saved = await this.data.insert<DoctorVisit>('doctor_visits', {
        id: uuid(), child_id: input.child_id, doctor_id: input.doctor_id ?? null, scheduled_at: input.scheduled_at,
        completed_at: null, status: input.status ?? 'scheduled', reason: input.reason ?? null, notes: input.notes ?? null,
        follow_up_date: input.follow_up_date ?? null, tasks: input.tasks ?? [], created_by: this.auth.user()?.id ?? '',
        created_at: now, updated_at: now,
      });
    }
    await this.reminders.setVisitReminders(saved, presetKeys, this.label(saved));
    return saved;
  }

  async setStatus(v: DoctorVisit, status: DoctorVisit['status']): Promise<DoctorVisit> {
    const saved = await this.data.update<DoctorVisit>('doctor_visits', v.id, {
      status, completed_at: status === 'completed' ? new Date().toISOString() : null,
    });
    if (status !== 'scheduled') await this.reminders.setVisitReminders(saved, [], '');
    return saved;
  }

  updateTasks(v: DoctorVisit, tasks: DoctorVisit['tasks']): Promise<DoctorVisit> {
    return this.data.update<DoctorVisit>('doctor_visits', v.id, { tasks });
  }

  async remove(v: DoctorVisit): Promise<void> {
    await this.reminders.setVisitReminders({ ...v, status: 'cancelled' }, [], '');
    await this.data.remove('doctor_visits', v.id);
  }
}
