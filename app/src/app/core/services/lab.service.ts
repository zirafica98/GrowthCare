import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { appError } from '../data/errors';
import { q } from '../data/query';
import { LabResult, LabTest } from '../models/models';
import { uuid } from '../utils/uuid';

export interface LabResultInput {
  test_name: string;
  result_value: string;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  clinician_note?: string | null;
  source_text?: string | null;
}

export interface LabTestWithResults extends LabTest {
  results: LabResult[];
}

/** Parse "6,21" / "<9" / "> 60" → number (descriptive; flags are never computed). */
export function numericValue(v: string): number | null {
  const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

@Injectable({ providedIn: 'root' })
export class LabService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  async list(childId: string): Promise<LabTestWithResults[]> {
    const [tests, results] = await Promise.all([
      this.data.list<LabTest>('lab_tests', q().eq('child_id', childId).orderBy('collected_at', false)),
      this.data.list<LabResult>('lab_results', q().eq('child_id', childId).orderBy('test_name')),
    ]);
    return tests.map((t) => ({ ...t, results: results.filter((r) => r.lab_test_id === t.id) }));
  }

  /**
   * Create a lab event with results. `verified` is true only when the parent
   * entered or reviewed the values (manual entry or confirmed OCR review).
   */
  async create(
    childId: string,
    test: { collected_at: string; laboratory: string | null; notes: string | null; document_id?: string | null },
    results: LabResultInput[],
    verified = true,
  ): Promise<LabTestWithResults> {
    const clean = results.filter((r) => r.test_name.trim() && r.result_value.trim());
    if (!clean.length) throw appError('validation', null, 'Dodajte bar jedan rezultat.');
    const now = new Date().toISOString();
    const t = await this.data.insert<LabTest>('lab_tests', {
      id: uuid(), child_id: childId, collected_at: test.collected_at, laboratory: test.laboratory, notes: test.notes,
      document_id: test.document_id ?? null, created_by: this.auth.user()?.id ?? '', created_at: now,
    });
    const saved: LabResult[] = [];
    for (const r of clean) {
      saved.push(await this.data.insert<LabResult>('lab_results', {
        id: uuid(), lab_test_id: t.id, child_id: childId, test_name: r.test_name.trim(), result_value: r.result_value.trim(),
        result_numeric: numericValue(r.result_value), unit: r.unit?.trim() || null, reference_range: r.reference_range?.trim() || null,
        flag: r.flag?.trim() || null, clinician_note: r.clinician_note ?? null, source_text: r.source_text ?? null,
        verified, created_at: now,
      }));
    }
    return { ...t, results: saved };
  }

  updateResult(id: string, patch: Partial<LabResult>): Promise<LabResult> {
    const next = { ...patch };
    if (patch.result_value !== undefined) next.result_numeric = numericValue(patch.result_value);
    return this.data.update<LabResult>('lab_results', id, next);
  }

  removeResult(id: string): Promise<void> {
    return this.data.remove('lab_results', id);
  }

  updateTest(id: string, patch: Partial<LabTest>): Promise<LabTest> {
    return this.data.update<LabTest>('lab_tests', id, patch);
  }

  removeTest(id: string): Promise<void> {
    return this.data.remove('lab_tests', id);
  }

  /** Numeric history of one test name for charts. */
  history(tests: LabTestWithResults[], testName: string): { date: string; value: number; unit: string | null }[] {
    const key = normalizeTestName(testName);
    return tests
      .flatMap((t) => t.results.filter((r) => normalizeTestName(r.test_name) === key && r.result_numeric != null).map((r) => ({ date: t.collected_at, value: r.result_numeric!, unit: r.unit })))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export function normalizeTestName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}
