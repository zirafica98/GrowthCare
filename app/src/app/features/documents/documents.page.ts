import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DocumentCategory, MedicalDocument } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { CATEGORY_LABEL, DocumentService } from '../../core/services/document.service';
import { OcrService } from '../../core/services/ocr.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDate, toLocalDate } from '../../core/utils/dates';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';

const FILTERS: { v: DocumentCategory | 'all'; l: string }[] = [
  { v: 'all', l: 'Svi' }, { v: 'doctor_report', l: 'Izveštaji' }, { v: 'laboratory', l: 'Laboratorija' }, { v: 'prescription', l: 'Recepti' },
  { v: 'referral', l: 'Uputi' }, { v: 'imaging', l: 'Snimci' }, { v: 'therapy', l: 'Terapija' }, { v: 'other', l: 'Ostalo' },
];

export const OCR_STATUS_LABEL: Record<string, { l: string; tone: string }> = {
  none: { l: '', tone: '' }, pending: { l: 'Čeka očitavanje', tone: 'info' }, processing: { l: 'Očitava se…', tone: 'info' },
  review: { l: 'Proverite podatke', tone: 'warning' }, completed: { l: '', tone: '' }, failed: { l: 'Nije očitano', tone: 'danger' },
};

@Component({
  selector: 'app-documents-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, SheetComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Dokumenti" [subtitle]="children.selected()?.first_name ?? ''" />
      <div class="chips scroll" role="group" aria-label="Kategorija">
        @for (f of filters; track f.v) { <button type="button" class="chip" [attr.aria-pressed]="filter() === f.v" (click)="filter.set(f.v)">{{ f.l }}</button> }
      </div>
      <div style="height:12px"></div>
      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <app-loading [rows]="4" [height]="64" />
      } @else {
        <div class="card" style="padding:4px 12px">
          @for (d of list(); track d.id) {
            <a class="list-item" [routerLink]="['/app/documents', d.id]">
              <span class="icon-tile" [class.danger]="d.mime_type === 'application/pdf'" [class.success]="d.mime_type !== 'application/pdf'">
                <app-icon [name]="d.mime_type === 'application/pdf' ? 'file' : 'image'" [size]="20" /></span>
              <span class="grow">
                <b class="small ellipsis" style="display:block">{{ d.title }}</b>
                <span class="tiny muted">{{ cat[d.category] }} · {{ fmt(d.document_date) }}</span>
                @if (ocrLabel(d.ocr_status).l) { <span class="badge" [class]="'badge ' + ocrLabel(d.ocr_status).tone" style="margin-left:6px">{{ ocrLabel(d.ocr_status).l }}</span> }
              </span>
              <app-icon name="chevron-right" [size]="16" />
            </a>
          } @empty {
            <app-empty-state title="Nema dokumenata" text="Dodajte dokumente iz galerije ili napravite fotografiju." image="illustrations/e-documents.png" />
          }
        </div>
      }
    </div>

    <button class="fab" type="button" (click)="addOpen.set(true)" aria-label="Dodaj dokument"><app-icon name="plus" [size]="26" /></button>

    <input #camera type="file" accept="image/*" capture="environment" hidden (change)="picked($event)" />
    <input #gallery type="file" accept="image/*" hidden (change)="picked($event)" />
    <input #filePick type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.pdf" hidden (change)="picked($event)" />

    <app-sheet [open]="addOpen()" title="Dodaj dokument" (closed)="closeAdd()">
      <div class="stack">
        <div class="notice info small"><app-icon name="user" [size]="16" /> Dokument za: <b>{{ children.selected()?.first_name }}</b></div>
        @if (!file()) {
          <img src="illustrations/ocr-phone.png" alt="" class="add-ill" width="168" height="140" />
          <div class="grid-3">
            <button class="pick" type="button" (click)="camera.click()"><app-icon name="camera" [size]="26" /><span>Kamera</span></button>
            <button class="pick" type="button" (click)="gallery.click()"><app-icon name="image" [size]="26" /><span>Galerija</span></button>
            <button class="pick" type="button" (click)="filePick.click()"><app-icon name="upload" [size]="26" /><span>Fajl / PDF</span></button>
          </div>
          <p class="tiny muted">PDF, JPG, PNG ili HEIC, do 20 MB. Original se čuva privatno, dostupan samo vašoj porodici.</p>
        } @else {
          <div class="card flat tight row">
            <app-icon [name]="file()!.type === 'application/pdf' ? 'file' : 'image'" />
            <span class="grow small ellipsis">{{ file()!.name }}</span>
            <button class="btn sm ghost" type="button" (click)="file.set(null)">Promeni</button>
          </div>
          <div class="field"><label for="d-cat">Kategorija</label>
            <select id="d-cat" class="select" [(ngModel)]="category">@for (f of filters.slice(1); track f.v) { <option [value]="f.v">{{ f.l }}</option> }</select></div>
          <div class="grid-2">
            <div class="field"><label for="d-title">Naslov (opciono)</label><input id="d-title" class="input" [(ngModel)]="title" /></div>
            <div class="field"><label for="d-date">Datum</label><input id="d-date" class="input" type="date" [(ngModel)]="docDate" /></div>
          </div>
          <label class="check"><input type="checkbox" [(ngModel)]="runOcr" [disabled]="!ocrSupported()" />
            <span class="small">Automatski očitaj podatke (OCR) — pre čuvanja ćete ih proveriti{{ ocrSupported() ? '' : ' (nije dostupno za ovaj format)' }}</span></label>
          <div class="sheet-actions"><button class="btn primary lg block" type="button" [disabled]="busy()" (click)="upload()">{{ busy() ? statusText() : 'Otpremi' }}</button></div>
        }
      </div>
    </app-sheet>`,
  styles: [`
    .chips.scroll { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
    .chips.scroll .chip { flex: 0 0 auto; }
    .add-ill { width: 100%; max-height: 120px; object-fit: cover; border-radius: 18px; }
    .pick { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 8px; border-radius: 16px; border: 1px solid var(--border-strong); background: var(--primary-softer); color: var(--primary-strong); font-weight: 600; cursor: pointer; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage {
  readonly children = inject(ChildService);
  private readonly docs = inject(DocumentService);
  private readonly ocr = inject(OcrService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  /** ?visit=… links a new upload to a doctor visit. */
  readonly visit = input<string>('');
  readonly filters = FILTERS;
  readonly cat = CATEGORY_LABEL;
  readonly fmt = formatDate;
  readonly filter = signal<DocumentCategory | 'all'>('all');
  readonly addOpen = signal(false);
  readonly file = signal<File | null>(null);
  readonly busy = signal(false);
  readonly statusText = signal('Otpremanje…');
  readonly data = childData((id) => this.docs.list(id));
  readonly list = computed(() => (this.data.value() ?? []).filter((d) => this.filter() === 'all' || d.category === this.filter()));

  category: DocumentCategory = 'laboratory';
  title = '';
  docDate = toLocalDate(new Date());
  runOcr = true;

  ocrLabel(s: string) {
    return OCR_STATUS_LABEL[s] ?? OCR_STATUS_LABEL['none'];
  }

  ocrSupported(): boolean {
    const f = this.file();
    return !!f && this.ocr.supports(f.type || 'image/jpeg');
  }

  picked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    try {
      this.docs.validate(f);
      this.file.set(f);
      this.runOcr = this.ocr.supports(f.type);
      if (this.filter() !== 'all') this.category = this.filter() as DocumentCategory;
    } catch (e) {
      this.toast.error(e);
    }
  }

  closeAdd(): void {
    if (this.busy()) return;
    this.addOpen.set(false);
    this.file.set(null);
    this.title = '';
  }

  async upload(): Promise<void> {
    const f = this.file();
    const childId = this.children.selectedChildId();
    if (!f || !childId) return;
    this.busy.set(true);
    this.statusText.set('Otpremanje…');
    let doc: MedicalDocument | null = null;
    try {
      doc = await this.docs.upload(childId, f, { category: this.category, title: this.title, document_date: this.docDate || null });
      if (this.visit()) doc = await this.docs.update(doc.id, { doctor_visit_id: this.visit() });
      if (this.runOcr && this.ocrSupported()) {
        this.statusText.set('Očitavanje dokumenta…');
        try {
          doc = await this.ocr.process(doc, f);
          this.toast.info('Dokument je očitan. Proverite podatke pre čuvanja.');
          this.addOpen.set(false);
          this.file.set(null);
          await this.router.navigate(['/app/documents', doc.id, 'review']);
          return;
        } catch {
          this.toast.warning('Nismo uspeli da očitamo dokument. Original je sačuvan — podatke možete uneti ručno.');
        }
      } else {
        doc = await this.docs.update(doc.id, { ocr_status: 'none' });
        this.toast.success('Dokument je sačuvan.');
      }
      this.addOpen.set(false);
      this.file.set(null);
      await this.router.navigate(['/app/documents', doc.id]);
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
