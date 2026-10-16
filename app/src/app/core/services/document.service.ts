import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DataService } from '../data/data.service';
import { appError } from '../data/errors';
import { q } from '../data/query';
import { DocumentCategory, DocumentExtraction, MedicalDocument } from '../models/models';
import { toLocalDate } from '../utils/dates';
import { uuid } from '../utils/uuid';
import { FamilyService } from './family.service';

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  doctor_report: 'Izveštaj lekara',
  laboratory: 'Laboratorija',
  prescription: 'Recept',
  referral: 'Uput',
  imaging: 'Snimci',
  therapy: 'Terapija',
  other: 'Ostalo',
};

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Strip anything that could escape the storage folder or leak into URLs. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'dokument';
  const cleaned = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '');
  return cleaned.slice(-120) || 'dokument';
}

export function guessMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'heic' || ext === 'heif' ? 'image/heic' : ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly family = inject(FamilyService);

  list(childId: string): Promise<MedicalDocument[]> {
    return this.data.list<MedicalDocument>('documents', q().eq('child_id', childId).orderBy('document_date', false).orderBy('created_at', false));
  }

  get(id: string): Promise<MedicalDocument | null> {
    return this.data.get<MedicalDocument>('documents', id);
  }

  validate(file: File): string {
    const mime = guessMime(file);
    if (!ACCEPTED_TYPES.includes(mime)) throw appError('upload', null, 'Podržani su PDF, JPG, PNG i HEIC dokumenti.');
    if (file.size > MAX_FILE_BYTES) throw appError('upload', null, 'Dokument je veći od 20 MB.');
    if (file.size === 0) throw appError('upload', null, 'Dokument je prazan.');
    return mime;
  }

  /**
   * 1) store the original in private storage, 2) create the document row.
   * Uploads are not queued offline (raw documents are never kept in local storage).
   */
  async upload(childId: string, file: File, meta: { category: DocumentCategory; title?: string; document_date?: string | null }): Promise<MedicalDocument> {
    const mime = this.validate(file);
    const fam = this.family.current();
    if (!fam) throw appError('permission');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw appError('upload', null, 'Otpremanje dokumenata zahteva internet vezu.');
    const id = uuid();
    const path = `${fam.id}/${childId}/${id}/${safeFilename(file.name)}`;
    await this.data.upload(path, file, mime);
    const now = new Date().toISOString();
    const row: MedicalDocument = {
      id, child_id: childId, family_id: fam.id, storage_path: path, original_filename: file.name.slice(0, 200), mime_type: mime,
      size_bytes: file.size, category: meta.category, document_date: meta.document_date ?? toLocalDate(new Date()),
      title: meta.title?.trim() || CATEGORY_LABEL[meta.category], tags: [], doctor_visit_id: null, medication_id: null,
      ocr_status: 'pending', ocr_text: null, created_by: this.auth.user()?.id ?? '', created_at: now, updated_at: now,
    };
    try {
      return await this.data.insert('documents', row);
    } catch (err) {
      await this.data.removeFile(path).catch(() => undefined);
      throw err;
    }
  }

  /** Short-lived URL (5 min). Never a permanent public URL. */
  url(doc: MedicalDocument): Promise<string> {
    return this.data.signedUrl(doc.storage_path, 300);
  }

  file(doc: MedicalDocument): Promise<Blob> {
    return this.data.download(doc.storage_path);
  }

  update(id: string, patch: Partial<MedicalDocument>): Promise<MedicalDocument> {
    const { family_id: _f, child_id: _c, storage_path: _p, id: _id, ...safe } = patch;
    return this.data.update<MedicalDocument>('documents', id, safe);
  }

  async remove(doc: MedicalDocument): Promise<void> {
    await this.data.remove('documents', doc.id);
    await this.data.removeFile(doc.storage_path).catch(() => undefined);
  }

  extractions(documentId: string): Promise<DocumentExtraction[]> {
    return this.data.list<DocumentExtraction>('document_extractions', q().eq('document_id', documentId).orderBy('created_at'));
  }
}
