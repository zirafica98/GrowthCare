import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { AppError, appError } from '../data/errors';
import { q } from '../data/query';
import { Injection, InjectionReaction, Medication } from '../models/models';
import { addDays, startOfDay } from '../utils/dates';
import { DoseSlot, expectedSlots } from '../utils/dose-schedule';
import { uuid } from '../utils/uuid';
import { FamilyService } from './family.service';

export interface GiveDoseInput {
  dose: number;
  administeredAt: Date;
  site: string | null;
  reaction: InjectionReaction;
  note: string | null;
  administeredBy: string | null;
}

@Injectable({ providedIn: 'root' })
export class DoseService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly family = inject(FamilyService);

  medications(childId: string): Promise<Medication[]> {
    return this.data.list<Medication>('medications', q().eq('child_id', childId).orderBy('created_at'));
  }

  injections(childId: string, from?: Date, to?: Date): Promise<Injection[]> {
    const query = q().eq('child_id', childId).orderBy('scheduled_for', false);
    if (from) query.gte('scheduled_for', from.toISOString());
    if (to) query.lte('scheduled_for', to.toISOString());
    return this.data.list<Injection>('injections', query);
  }

  /** Slots for [from, to] — recorded + derived (pending/missed). */
  async slots(childId: string, from: Date, to: Date): Promise<DoseSlot[]> {
    const [meds, inj] = await Promise.all([
      this.medications(childId),
      this.injections(childId, startOfDay(from), addDays(startOfDay(to), 1)),
    ]);
    return expectedSlots(meds, inj, from, to);
  }

  todaySlots(childId: string): Promise<DoseSlot[]> {
    const today = new Date();
    return this.slots(childId, today, today);
  }

  /**
   * Record that a scheduled dose was given. The slot's child is checked against
   * `expectedChildId` to prevent cross-child mistakes when the selection changes.
   */
  async give(slot: DoseSlot, input: GiveDoseInput, expectedChildId: string): Promise<Injection> {
    this.assertChild(slot, expectedChildId);
    const now = new Date().toISOString();
    const fields: Partial<Injection> = {
      status: 'given', dose: input.dose, dose_unit: slot.medication.dose_unit,
      administered_at: input.administeredAt.toISOString(), administered_by: input.administeredBy ?? this.auth.user()?.id ?? null,
      injection_site: input.site, reaction: input.reaction, note: input.note, skip_reason: null,
    };
    return this.upsertSlot(slot, fields, now);
  }

  /** Record a dose as not given. A reason is required. No medical advice is given. */
  async skip(slot: DoseSlot, reason: string, note: string | null, expectedChildId: string): Promise<Injection> {
    this.assertChild(slot, expectedChildId);
    if (!reason?.trim()) throw appError('validation', null, 'Izaberite razlog.');
    const fields: Partial<Injection> = {
      status: 'skipped', dose: null, dose_unit: slot.medication.dose_unit, administered_at: null,
      administered_by: this.auth.user()?.id ?? null, injection_site: null, reaction: null, skip_reason: reason, note,
    };
    return this.upsertSlot(slot, fields, new Date().toISOString());
  }

  update(id: string, patch: Partial<Injection>): Promise<Injection> {
    const { child_id: _c, medication_id: _m, scheduled_for: _s, id: _id, ...safe } = patch;
    return this.data.update<Injection>('injections', id, safe);
  }

  remove(id: string): Promise<void> {
    return this.data.remove('injections', id);
  }

  /** Most recent injection site (descriptive — helps parents rotate sites). */
  async lastSite(childId: string): Promise<string | null> {
    const list = await this.data.list<Injection>('injections', q().eq('child_id', childId).eq('status', 'given').orderBy('administered_at', false).take(1));
    return list[0]?.injection_site ?? null;
  }

  private assertChild(slot: DoseSlot, expectedChildId: string): void {
    if (slot.medication.child_id !== expectedChildId) {
      throw appError('validation', null, 'Izabrano dete se promenilo. Otvorite dozu ponovo.');
    }
  }

  private async upsertSlot(slot: DoseSlot, fields: Partial<Injection>, now: string): Promise<Injection> {
    if (slot.record) return this.update(slot.record.id, fields);
    const row: Injection = {
      id: uuid(), child_id: slot.medication.child_id, medication_id: slot.medication.id, scheduled_for: slot.scheduledFor,
      administered_at: null, dose: null, dose_unit: slot.medication.dose_unit, status: 'pending', administered_by: null,
      injection_site: null, reaction: null, skip_reason: null, note: null, created_at: now, updated_at: now, ...fields,
    };
    try {
      return await this.data.insert('injections', row);
    } catch (err) {
      if (err instanceof AppError && err.kind === 'conflict') {
        // The other parent already recorded this scheduled dose. Never overwrite silently.
        const existing = (await this.injections(slot.medication.child_id, new Date(slot.scheduledFor), new Date(slot.scheduledFor)))
          .find((i) => i.medication_id === slot.medication.id && i.scheduled_for === slot.scheduledFor);
        const who = existing ? this.family.memberName(existing.administered_by) : 'drugi roditelj';
        throw appError('conflict', err, `Ovu dozu je već zabeležio/la ${who}.`);
      }
      throw err;
    }
  }
}
