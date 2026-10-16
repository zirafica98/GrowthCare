import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DocumentCategory, DoctorVisit, MedicalDocument } from '../../core/models/models';
import { CATEGORY_LABEL, DocumentService } from '../../core/services/document.service';
import { OcrService } from '../../core/services/ocr.service';
import { ToastService } from '../../core/services/toast.service';
import { VisitService } from '../../core/services/visit.service';
import { formatDate, formatDateTime } from '../../core/utils/dates';
import { ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { DocumentPreviewComponent } from './document-preview.component';
import { OCR_STATUS_LABEL } from './documents.page';

@Component({
  selector: 'app-document-detail-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, DocumentPreviewComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header [title]="doc()?.title ?? 'Dokument'" [back]="true" backLink="/app/documents" />
      @if (error()) {
        <app-error-state message="Dokument nije pronađen ili nemate pristup." kind="permission" [retryable]="false" />
      } @else if (!doc()) {
        <app-loading [rows]="1" [height]="320" />
      } @else {
        @let d = doc()!;
        <app-document-preview [doc]="d" [height]="380" />
        <div class="row wrap" style="margin:12px 0">
          <button class="btn outline sm" type="button" (click)="download()"><app-icon name="download" [size]="16" /> Preuzmi</button>
          @if (d.ocr_status === 'review') { <a class="btn primary sm" [routerLink]="['/app/documents', d.id, 'review']"><app-icon name="scan" [size]="16" /> Proveri očitane podatke</a> }
          @if (canOcr()) {
            <button class="btn outline sm" type="button" [disabled]="busy()" (click)="runOcr()"><app-icon name="sparkles" [size]="16" /> {{ busy() ? 'Očitavanje… ' + (progress() ?? '') : d.ocr_status === 'failed' ? 'Pokušaj ponovo' : 'Očitaj podatke' }}</button>
          }
        </div>

        @if (d.ocr_status === 'failed') {
          <div class="notice warning" style="margin-bottom:12px"><app-icon name="alert" [size]="18" /><span>Nismo uspeli da očitamo dokument. Original je sačuvan — unesite podatke ručno ili pokušajte ponovo sa oštrijom fotografijom.</span></div>
        }

        <section class="card stack">
          <div class="field"><label for="dd-title">Naslov</label><input id="dd-title" class="input" [(ngModel)]="title" /></div>
          <div class="grid-2">
            <div class="field"><label for="dd-cat">Kategorija</label>
              <select id="dd-cat" class="select" [(ngModel)]="category">@for (c of cats; track c[0]) { <option [value]="c[0]">{{ c[1] }}</option> }</select></div>
            <div class="field"><label for="dd-date">Datum</label><input id="dd-date" class="input" type="date" [(ngModel)]="date" /></div>
          </div>
          <div class="field"><label for="dd-visit">Povezana kontrola</label>
            <select id="dd-visit" class="select" [(ngModel)]="visitId"><option value="">— nema —</option>
              @for (v of visits(); track v.id) { <option [value]="v.id">{{ fmtDate(v.scheduled_at) }} · {{ v.reason || 'Kontrola' }}</option> }</select></div>
          <div class="field"><label for="dd-tags">Oznake (odvojene zarezom)</label><input id="dd-tags" class="input" [(ngModel)]="tags" /></div>
          <button class="btn primary" type="button" (click)="save()">Sačuvaj izmene</button>
        </section>

        <p class="tiny muted" style="margin:12px 4px">{{ d.original_filename }} · {{ size(d.size_bytes) }} · dodato {{ fmtDT(d.created_at) }}{{ statusLabel(d.ocr_status) ? ' · ' + statusLabel(d.ocr_status) : '' }}</p>
        @if (d.ocr_text) {
          <details class="card"><summary class="small strong" style="cursor:pointer">Očitani tekst (sirov OCR)</summary><pre class="ocr">{{ d.ocr_text }}</pre></details>
        }
        <button class="btn ghost block" style="margin-top:16px; color:var(--danger)" type="button" (click)="remove()"><app-icon name="trash" [size]="18" /> Obriši dokument</button>
      }
    </div>`,
  styles: [`.ocr { white-space: pre-wrap; font-size: 12.5px; font-family: ui-monospace, monospace; max-height: 320px; overflow: auto; margin: 10px 0 0; color: var(--text-2); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentDetailPage implements OnInit {
  readonly id = input.required<string>();
  private readonly docs = inject(DocumentService);
  private readonly ocr = inject(OcrService);
  private readonly visitSvc = inject(VisitService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  readonly cats = Object.entries(CATEGORY_LABEL);
  readonly doc = signal<MedicalDocument | null>(null);
  readonly visits = signal<DoctorVisit[]>([]);
  readonly error = signal(false);
  readonly busy = signal(false);
  readonly fmtDate = formatDate;
  readonly fmtDT = formatDateTime;
  title = '';
  category: DocumentCategory = 'other';
  date = '';
  visitId = '';
  tags = '';

  progress(): string | null {
    const p = this.ocr.progress()[this.id()];
    return p !== undefined ? `${p}%` : null;
  }

  async ngOnInit(): Promise<void> {
    try {
      const d = await this.docs.get(this.id());
      if (!d) throw new Error('nf');
      this.setDoc(d);
      this.visits.set(await this.visitSvc.list(d.child_id));
    } catch {
      this.error.set(true);
    }
  }

  private setDoc(d: MedicalDocument): void {
    this.doc.set(d);
    this.title = d.title;
    this.category = d.category;
    this.date = d.document_date ?? '';
    this.visitId = d.doctor_visit_id ?? '';
    this.tags = d.tags.join(', ');
  }

  canOcr(): boolean {
    const d = this.doc();
    return !!d && ['none', 'pending', 'failed', 'completed'].includes(d.ocr_status) && this.ocr.supports(d.mime_type);
  }

  statusLabel(s: string): string {
    return OCR_STATUS_LABEL[s]?.l ?? '';
  }

  size(b: number): string {
    return b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
  }

  async save(): Promise<void> {
    try {
      this.setDoc(await this.docs.update(this.id(), {
        title: this.title.trim() || this.doc()!.title, category: this.category, document_date: this.date || null,
        doctor_visit_id: this.visitId || null, tags: this.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20),
      }));
      this.toast.success('Izmene su sačuvane.');
    } catch (e) {
      this.toast.error(e);
    }
  }

  async runOcr(): Promise<void> {
    this.busy.set(true);
    try {
      const d = await this.ocr.process(this.doc()!);
      this.setDoc(d);
      await this.router.navigate(['/app/documents', d.id, 'review']);
    } catch (e) {
      this.toast.warning('Nismo uspeli da očitamo dokument. Unesite podatke ručno ili pokušajte ponovo.');
      const d = await this.docs.get(this.id());
      if (d) this.setDoc(d);
    } finally {
      this.busy.set(false);
    }
  }

  async download(): Promise<void> {
    try {
      const d = this.doc()!;
      const blob = await this.docs.file(d);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.original_filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      this.toast.error(e);
    }
  }

  async remove(): Promise<void> {
    const d = this.doc()!;
    const ok = await this.confirm.ask({
      title: 'Obrisati dokument?', danger: true, confirmText: 'Obriši trajno',
      message: `Original „${d.title}” i njegovi očitani podaci biće obrisani. Laboratorijski rezultati i merenja koje ste već potvrdili ostaju.`,
    });
    if (!ok) return;
    try {
      await this.docs.remove(d);
      this.toast.success('Dokument je obrisan.');
      await this.router.navigateByUrl('/app/documents');
    } catch (e) {
      this.toast.error(e);
    }
  }
}
