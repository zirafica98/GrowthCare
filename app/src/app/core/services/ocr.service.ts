import { inject, Injectable, signal } from '@angular/core';
import { DataService } from '../data/data.service';
import { AppError, appError } from '../data/errors';
import { Confidence, DocumentCategory, DocumentExtraction, MedicalDocument } from '../models/models';
import { adjustForOcrConfidence, ExtractedLabResult, extractAll, FieldName } from '../ocr/medical-text-extractor';
import { OCR_PROVIDER } from '../ocr/ocr-provider';
import { combineLocal } from '../utils/dates';
import { uuid } from '../utils/uuid';
import { DocumentService } from './document.service';
import { FamilyService } from './family.service';
import { GrowthService } from './growth.service';
import { LabService } from './lab.service';
import { VisitService } from './visit.service';

export interface ReviewField {
  name: FieldName;
  value: string;
  original: string;
  confidence: Confidence;
  include: boolean;
}

export interface ReviewLab extends ExtractedLabResult {
  include: boolean;
}

export interface ReviewDecision {
  title: string;
  category: DocumentCategory;
  documentDate: string | null;
  fields: ReviewField[];
  labs: ReviewLab[];
  saveLabs: boolean;
  saveMeasurement: boolean;
  createFollowUp: boolean;
}

export interface ReviewOutcome {
  labTestId: string | null;
  measurementId: string | null;
  visitId: string | null;
}

/**
 * Upload → OCR → Extraction → Review → Confirm → Save.
 * OCR output is stored as candidates (document_extractions, verified=false)
 * and only becomes structured medical data in `confirm()`, which is called
 * exclusively from the parent's review screen.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private readonly provider = inject(OCR_PROVIDER);
  private readonly data = inject(DataService);
  private readonly docs = inject(DocumentService);
  private readonly labs = inject(LabService);
  private readonly growth = inject(GrowthService);
  private readonly visits = inject(VisitService);
  private readonly family = inject(FamilyService);

  /** documentId → progress 0–100 */
  readonly progress = signal<Record<string, number>>({});

  supports(mimeType: string): boolean {
    return this.provider.supports(mimeType);
  }

  async process(doc: MedicalDocument, file?: Blob): Promise<MedicalDocument> {
    await this.docs.update(doc.id, { ocr_status: 'processing' });
    try {
      const blob = file ?? (await this.docs.file(doc));
      const out = await this.provider.recognize(
        { file: blob, mimeType: doc.mime_type, documentId: doc.id, storagePath: doc.storage_path },
        (p) => this.progress.update((m) => ({ ...m, [doc.id]: p })),
      );
      if (!out.text.trim()) throw new Error('empty');
      const result = extractAll(out.text);
      const fields = adjustForOcrConfidence(result.fields, out.confidence);
      const labs = adjustForOcrConfidence(result.labResults, out.confidence);

      // Replace earlier candidates (retry) — never touches verified data.
      for (const old of await this.docs.extractions(doc.id)) if (!old.verified) await this.data.remove('document_extractions', old.id);
      const now = new Date().toISOString();
      const rows: DocumentExtraction[] = [
        ...fields.map((f) => ({ field_name: f.name as string, extracted_value: f.value, confidence: f.confidence })),
        { field_name: 'document_type', extracted_value: result.documentType, confidence: 'medium' as Confidence },
        ...labs.map((l) => ({ field_name: 'lab_result', extracted_value: JSON.stringify(l), confidence: l.confidence })),
      ].map((r) => ({ id: uuid(), document_id: doc.id, child_id: doc.child_id, verified: false, verified_value: null, created_at: now, ...r }));
      for (const r of rows) await this.data.insert('document_extractions', r);

      return await this.docs.update(doc.id, { ocr_status: 'review', ocr_text: out.text });
    } catch (err) {
      await this.docs.update(doc.id, { ocr_status: 'failed' });
      throw err instanceof AppError && (err.kind === 'ocr' || err.kind === 'network') ? err : appError('ocr', err);
    } finally {
      this.progress.update((m) => {
        const { [doc.id]: _done, ...rest } = m;
        return rest;
      });
    }
  }

  /** Build the editable review model from stored candidates. */
  async reviewModel(doc: MedicalDocument): Promise<{ fields: ReviewField[]; labs: ReviewLab[]; documentType: DocumentCategory | null }> {
    const ex = await this.docs.extractions(doc.id);
    const fields: ReviewField[] = ex
      .filter((e) => e.field_name !== 'lab_result' && e.field_name !== 'document_type')
      .map((e) => ({
        name: e.field_name as FieldName, value: e.verified_value ?? e.extracted_value, original: e.extracted_value,
        confidence: e.confidence, include: e.field_name !== 'diagnosis', // diagnosis text is opt-in
      }));
    const labs: ReviewLab[] = ex.filter((e) => e.field_name === 'lab_result').map((e) => ({ ...(JSON.parse(e.extracted_value) as ExtractedLabResult), include: true }));
    const type = ex.find((e) => e.field_name === 'document_type')?.extracted_value as DocumentCategory | undefined;
    return { fields, labs, documentType: type ?? null };
  }

  /** Persist ONLY what the parent confirmed. */
  async confirm(doc: MedicalDocument, d: ReviewDecision): Promise<ReviewOutcome> {
    const val = (n: FieldName) => d.fields.find((f) => f.name === n && f.include)?.value?.trim() || null;
    const outcome: ReviewOutcome = { labTestId: null, measurementId: null, visitId: null };

    // 1. Mark reviewed candidates; edits are kept next to the original value (audited).
    const stored = await this.docs.extractions(doc.id);
    for (const f of d.fields) {
      const row = stored.find((s) => s.field_name === f.name && !s.verified);
      if (row && f.include) await this.data.update<DocumentExtraction>('document_extractions', row.id, { verified: true, verified_value: f.value });
    }

    // 2. Lab results.
    const labs = d.labs.filter((l) => l.include && l.test_name.trim() && l.result_value.trim());
    if (d.saveLabs && labs.length) {
      const date = val('lab_date') ?? d.documentDate;
      const test = await this.labs.create(doc.child_id, {
        collected_at: date ? combineLocal(date, '08:00').toISOString() : new Date().toISOString(),
        laboratory: val('clinic'), notes: null, document_id: doc.id,
      }, labs.map((l) => ({ ...l, source_text: l.source_text })), true);
      outcome.labTestId = test.id;
      for (const row of stored.filter((s) => s.field_name === 'lab_result' && !s.verified)) {
        await this.data.update<DocumentExtraction>('document_extractions', row.id, { verified: true });
      }
    }

    // 3. Growth measurement.
    const h = val('height_cm');
    const w = val('weight_kg');
    if (d.saveMeasurement && (h || w)) {
      const m = await this.growth.add(doc.child_id, {
        measured_at: d.documentDate ? combineLocal(d.documentDate, '12:00').toISOString() : new Date().toISOString(),
        height_cm: h ? Number(h.replace(',', '.')) : null, weight_kg: w ? Number(w.replace(',', '.')) : null,
        head_circumference_cm: null, source: 'document', note: `Iz dokumenta: ${d.title}`,
      });
      outcome.measurementId = m.id;
    }

    // 4. Follow-up appointment.
    const follow = val('follow_up');
    if (d.createFollowUp && follow) {
      const doctorName = val('doctor');
      let doctorId: string | null = null;
      if (doctorName) {
        const existing = this.family.doctors().find((x) => x.name.toLowerCase() === doctorName.toLowerCase());
        doctorId = existing?.id ?? (await this.family.saveDoctor({ name: doctorName, specialty: val('specialty'), clinic: val('clinic') })).id;
      }
      const v = await this.visits.save({
        child_id: doc.child_id, doctor_id: doctorId, scheduled_at: combineLocal(follow, '09:00').toISOString(),
        reason: `Kontrola${val('specialty') ? ` — ${val('specialty')}` : ''}`, notes: `Iz dokumenta „${d.title}”. Proverite tačan termin.`,
      }, ['7d', '1d']);
      outcome.visitId = v.id;
    }

    // 5. Document metadata + status.
    await this.docs.update(doc.id, {
      title: d.title.trim() || doc.title, category: d.category, document_date: d.documentDate, ocr_status: 'completed',
      doctor_visit_id: doc.doctor_visit_id,
    });
    return outcome;
  }

  /** Skip extraction; the original document stays, metadata entered manually. */
  async saveManual(doc: MedicalDocument, meta: { title: string; category: DocumentCategory; documentDate: string | null }): Promise<MedicalDocument> {
    return this.docs.update(doc.id, { title: meta.title, category: meta.category, document_date: meta.documentDate, ocr_status: doc.ocr_status === 'failed' ? 'failed' : 'completed' });
  }
}
