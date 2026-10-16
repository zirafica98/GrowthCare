import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { appError } from '../data/errors';
import { q } from '../data/query';
import { GrowthMeasurement, MeasurementSource } from '../models/models';
import { bmi } from '../utils/growth';
import { uuid } from '../utils/uuid';

export interface MeasurementInput {
  measured_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  head_circumference_cm: number | null;
  source: MeasurementSource;
  note: string | null;
}

@Injectable({ providedIn: 'root' })
export class GrowthService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  list(childId: string): Promise<GrowthMeasurement[]> {
    return this.data.list<GrowthMeasurement>('growth_measurements', q().eq('child_id', childId).orderBy('measured_at'));
  }

  async latest(childId: string): Promise<GrowthMeasurement[]> {
    return this.list(childId);
  }

  validate(input: MeasurementInput): void {
    if (input.height_cm == null && input.weight_kg == null && input.head_circumference_cm == null) {
      throw appError('validation', null, 'Unesite bar jednu vrednost.');
    }
    if (input.height_cm != null && (input.height_cm < 30 || input.height_cm > 230)) throw appError('validation', null, 'Visina mora biti između 30 i 230 cm.');
    if (input.weight_kg != null && (input.weight_kg < 1 || input.weight_kg > 200)) throw appError('validation', null, 'Težina mora biti između 1 i 200 kg.');
  }

  async add(childId: string, input: MeasurementInput): Promise<GrowthMeasurement> {
    this.validate(input);
    const row: GrowthMeasurement = {
      id: uuid(), child_id: childId, ...input, bmi: bmi(input.height_cm, input.weight_kg),
      created_by: this.auth.user()?.id ?? '', created_at: new Date().toISOString(),
    };
    return this.data.insert('growth_measurements', row);
  }

  async update(m: GrowthMeasurement, input: MeasurementInput): Promise<GrowthMeasurement> {
    this.validate(input);
    return this.data.update<GrowthMeasurement>('growth_measurements', m.id, { ...input, bmi: bmi(input.height_cm, input.weight_kg) });
  }

  remove(id: string): Promise<void> {
    return this.data.remove('growth_measurements', id);
  }
}
