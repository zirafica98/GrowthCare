import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DocumentCategory, MedicalDocument } from '../../core/models/models';
import { FIELD_LABELS, FieldName } from '../../core/ocr/medical-text-extractor';
import { ChildService } from '../../core/services/child.service';
import { CATEGORY_LABEL, DocumentService } from '../../core/services/document.service';
import { OcrService, ReviewField, ReviewLab } from '../../core/services/ocr.service';
import { ToastService } from '../../core/services/toast.service';
import { ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { DocumentPreviewComponent } from './document-preview.component';

const META_FIELDS: FieldName[] = ['title', 'document_date', 'doctor', 'specialty', 'clinic'];
const THERAPY_FIELDS: FieldName[] = ['medication', 'strength', 'dose', 'dose_unit', 'frequency', 'scheduled_time'];
const GROWTH_FIELDS: FieldName[] = ['height_cm', 'weight_kg'];

/**
 * OCR review (Upload → OCR → Extraction → REVIEW → Confirm → Save).
 * Every extracted value is editable, shows its confidence, and nothing is
 * stored as medical data until the parent presses "Potvrdi podatke".
 */
@Component({
  selector: 'app-ocr-review-page',
  imports: [FormsModule, PageHeaderComponent, IconComponent, DocumentPreviewComponent, LoadingSkeletonComponent, ErrorStateComponent],
  templateUrl: './ocr-review.page.html',
  styles: [`
    .layout { display: grid; gap: 16px; }
    @media (min-width: 1024px) { .layout { grid-template-columns: 1fr 1fr; align-items: start; } .preview { position: sticky; top: 80px; } }
    .frow { display: grid; grid-template-columns: 24px 1fr; gap: 10px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .frow:last-child { border-bottom: 0; }
    .frow input[type=checkbox] { width: 20px; height: 20px; margin-top: 30px; accent-color: var(--primary); }
    .conf { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
    .conf.high { background: var(--success-soft); color: var(--success); }
    .conf.medium { background: var(--warning-soft); color: var(--warning); }
    .conf.low { background: var(--danger-soft); color: var(--danger); }
    .edited { font-size: 11px; color: var(--primary-strong); font-weight: 600; }
    .lab { display: grid; grid-template-columns: 24px 1.4fr 1fr; gap: 6px 8px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .lab .sub { grid-column: 2 / 4; display: grid; grid-template-columns: 1fr 1fr 70px; gap: 6px; }
    .lab input[type=checkbox] { width: 20px; height: 20px; accent-color: var(--primary); }
    .lab .input { min-height: 40px; padding: 8px 10px; font-size: 15px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OcrReviewPage implements OnInit {
  readonly id = input.required<string>();
  readonly children = inject(ChildService);
  private readonly docs = inject(DocumentService);
  private readonly ocr = inject(OcrService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly labels = FIELD_LABELS;
  readonly cats = Object.entries(CATEGORY_LABEL) as [DocumentCategory, string][];
  readonly doc = signal<MedicalDocument | null>(null);
  readonly fields = signal<ReviewField[]>([]);
  readonly labs = signal<ReviewLab[]>([]);
  readonly error = signal(false);
  readonly busy = signal(false);
  category: DocumentCategory = 'other';
  saveLabs = true;
  saveMeasurement = true;
  createFollowUp = false;

  readonly meta = computed(() => this.fields().filter((f) => META_FIELDS.includes(f.name)));
  readonly therapy = computed(() => this.fields().filter((f) => THERAPY_FIELDS.includes(f.name)));
  readonly growth = computed(() => this.fields().filter((f) => GROWTH_FIELDS.includes(f.name)));
  readonly other = computed(() => this.fields().filter((f) => !META_FIELDS.includes(f.name) && !THERAPY_FIELDS.includes(f.name) && !GROWTH_FIELDS.includes(f.name)));
  readonly followUp = computed(() => this.fields().find((f) => f.name === 'follow_up') ?? null);
  /** The document belongs to the selected child — shown prominently to avoid mix-ups. */
  readonly child = computed(() => this.children.children().find((c) => c.id === this.doc()?.child_id) ?? null);

  async ngOnInit(): Promise<void> {
    try {
      const d = await this.docs.get(this.id());
      if (!d) throw new Error('nf');
      this.doc.set(d);
      const model = await this.ocr.reviewModel(d);
      this.fields.set(model.fields);
      this.labs.set(model.labs);
      this.category = model.documentType ?? d.category;
      this.createFollowUp = !!model.fields.find((f) => f.name === 'follow_up');
    } catch {
      this.error.set(true);
    }
  }

  field(name: FieldName): ReviewField | undefined {
    return this.fields().find((f) => f.name === name);
  }

  confLabel(c: string): string {
    return c === 'high' ? 'visoka pouzdanost' : c === 'medium' ? 'srednja pouzdanost' : 'niska pouzdanost';
  }

  inputType(name: FieldName): string {
    return name === 'document_date' || name === 'follow_up' || name === 'lab_date' ? 'date' : name === 'scheduled_time' ? 'time' : 'text';
  }

  touch(): void {
    this.fields.set([...this.fields()]);
  }

  setAllLabs(v: boolean): void {
    this.labs.set(this.labs().map((l) => ({ ...l, include: v })));
  }

  selectedLabs(): number {
    return this.labs().filter((l) => l.include).length;
  }

  async confirm(): Promise<void> {
    const d = this.doc();
    if (!d) return;
    if (this.children.selectedChildId() !== d.child_id) {
      this.toast.warning(`Ovaj dokument pripada detetu ${this.child()?.first_name ?? ''}. Proverite izbor deteta.`);
    }
    this.busy.set(true);
    try {
      const title = this.field('title')?.value || d.title;
      const out = await this.ocr.confirm(d, {
        title, category: this.category, documentDate: this.field('document_date')?.include ? this.field('document_date')!.value || null : d.document_date,
        fields: this.fields(), labs: this.labs(), saveLabs: this.saveLabs, saveMeasurement: this.saveMeasurement, createFollowUp: this.createFollowUp,
      });
      const parts = [out.labTestId ? `${this.selectedLabs()} lab. rezultata` : '', out.measurementId ? 'merenje' : '', out.visitId ? 'kontrola' : ''].filter(Boolean);
      this.toast.success(parts.length ? `Sačuvano: ${parts.join(', ')}.` : 'Podaci dokumenta su potvrđeni.');
      await this.router.navigate(out.labTestId ? ['/app/laboratory'] : ['/app/documents', d.id]);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  /** Therapy is never changed from here: open the explicit dose-change flow, prefilled. */
  recordTherapy(): void {
    const dose = this.field('dose')?.value;
    void this.router.navigate(['/app/therapy'], { queryParams: { newDose: dose?.replace(',', '.'), documentId: this.doc()?.id } });
  }

  cancel(): void {
    void this.router.navigate(['/app/documents', this.id()]);
  }
}
