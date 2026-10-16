import { inject, Injectable } from '@angular/core';
import { DataService } from '../data/data.service';
import { q } from '../data/query';
import { AuditLog } from '../models/models';

export const ENTITY_LABEL: Record<string, string> = {
  injections: 'Doza',
  medications: 'Terapija',
  therapy_changes: 'Promena doze',
  medication_stock: 'Zaliha leka',
  growth_measurements: 'Merenje',
  documents: 'Dokument',
  document_extractions: 'OCR podatak',
  family_members: 'Član porodice',
  family_invitations: 'Pozivnica',
  children: 'Dete',
  doctor_visits: 'Kontrola',
  lab_tests: 'Laboratorija',
  lab_results: 'Lab. rezultat',
};

export const ACTION_LABEL: Record<string, string> = { insert: 'dodato', update: 'izmenjeno', delete: 'obrisano' };

const FIELD_LABEL: Record<string, string> = {
  status: 'Status', dose: 'Doza', administered_at: 'Vreme', injection_site: 'Mesto', note: 'Napomena', skip_reason: 'Razlog',
  current_dose: 'Doza', scheduled_time: 'Vreme', height_cm: 'Visina', weight_kg: 'Težina', measured_at: 'Datum merenja',
  title: 'Naslov', category: 'Kategorija', ocr_status: 'OCR status', document_date: 'Datum', verified_value: 'Potvrđena vrednost',
  verified: 'Potvrđeno', result_value: 'Vrednost', scheduled_at: 'Termin', reason: 'Razlog', first_name: 'Ime',
  date_of_birth: 'Datum rođenja', role: 'Uloga', active: 'Aktivno', new_dose: 'Nova doza', name: 'Naziv',
};

const IGNORED = new Set(['updated_at', 'created_at', 'id', '_pending']);

export interface FieldDiff {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

/** Fields that changed between two row snapshots (shown on "what changed"). */
export function diff(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): FieldDiff[] {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  return [...keys]
    .filter((k) => !IGNORED.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => ({ field: k, label: FIELD_LABEL[k] ?? k, before: oldData[k], after: newData[k] }));
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly data = inject(DataService);

  list(familyId: string, opts: { childId?: string; entityType?: string; limit?: number } = {}): Promise<AuditLog[]> {
    const query = q().eq('family_id', familyId).orderBy('created_at', false).take(opts.limit ?? 200);
    if (opts.childId) query.eq('child_id', opts.childId);
    if (opts.entityType) query.eq('entity_type', opts.entityType);
    return this.data.list<AuditLog>('audit_logs', query);
  }

  forEntity(familyId: string, entityId: string): Promise<AuditLog[]> {
    return this.data.list<AuditLog>('audit_logs', q().eq('family_id', familyId).eq('entity_id', entityId).orderBy('created_at', false));
  }
}
