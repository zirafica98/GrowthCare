import { Confidence } from '../models/models';
import { ENDO_REPORT_WITH_LABS, STIMULATION_TEST, TABLE_LAB, THERAPY_START_REPORT } from './fixtures/sample-reports';
import { adjustForOcrConfidence, extractAll, ExtractionResult } from './medical-text-extractor';

const field = (r: ExtractionResult, name: string) => r.fields.find((f) => f.name === name)?.value;

describe('MedicalTextExtractor (candidate extraction only)', () => {
  it('extracts report metadata, measurements and inline lab results', () => {
    const r = extractAll(ENDO_REPORT_WITH_LABS);
    expect(r.documentType).toBe('doctor_report');
    expect(field(r, 'document_date')).toBe('2026-09-08');
    expect(field(r, 'specialty')).toBe('Dečja endokrinologija');
    expect(field(r, 'doctor')).toBe('Dr Petar Testić');
    expect(field(r, 'lab_date')).toBe('2026-09-03');
    // child's own values — not the parents' heights or birth values
    expect(field(r, 'height_cm')).toBe('98.9');
    expect(field(r, 'weight_kg')).toBe('14.8');
    const igf = r.labResults.find((l) => l.test_name === 'IGF-1')!;
    expect(igf.result_value).toBe('90.1');
    expect(igf.reference_range).toBe('18.9-116.0');
    expect(igf.unit).toBe('ng/mL');
    expect(r.labResults.find((l) => l.test_name === 'CRP (EDTA)')).toBeTruthy();
    expect(r.labResults.find((l) => l.test_name === 'TPO At')!.result_value).toBe('<9');
  });

  it('never computes a flag — flags are only copied from the source', () => {
    const r = extractAll(ENDO_REPORT_WITH_LABS);
    // Hemoglobin 105 is at the edge of its range; no flag is invented.
    expect(r.labResults.every((l) => l.flag === null)).toBeTrue();
  });

  it('extracts the prescribed therapy as written, skipping "nihil" blocks', () => {
    const r = extractAll(THERAPY_START_REPORT);
    expect(field(r, 'medication')).toBe('Omnitrope');
    expect(field(r, 'strength')).toBe('15 mg / 1,5 mL');
    expect(field(r, 'dose')).toBe('0.4');
    expect(field(r, 'dose_unit')).toBe('mg');
    expect(field(r, 'scheduled_time')).toBe('22:00');
    expect(field(r, 'follow_up')).toBe('2026-11-16');
    expect(r.fields.find((f) => f.name === 'follow_up')!.confidence).toBe('low');
    expect(field(r, 'diagnosis')).toContain('E23.0');
  });

  it('parses dynamic stimulation tests and table-style lab reports', () => {
    const s = extractAll(STIMULATION_TEST);
    expect(s.labResults.filter((l) => l.test_name.startsWith('Hormon rasta')).length).toBe(3);
    const t = extractAll(TABLE_LAB);
    expect(t.documentType).toBe('laboratory');
    expect(t.labResults.map((l) => l.test_name)).toEqual(['IGF-1', 'TSH', 'FT4']);
  });

  it('lowers confidence when the OCR engine was unsure', () => {
    const out = adjustForOcrConfidence<{ confidence: Confidence }>([{ confidence: 'high' }, { confidence: 'medium' }], 50);
    expect(out.map((o) => o.confidence)).toEqual(['medium', 'low']);
  });

  it('returns nothing useful from empty/noisy text instead of guessing', () => {
    const r = extractAll('lorem ipsum ### 12');
    expect(r.labResults.length).toBe(0);
    expect(r.documentType).toBe('other');
  });
});
