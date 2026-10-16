import { ChangeDetectionStrategy, Component, effect, inject, input, OnDestroy, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MedicalDocument } from '../../core/models/models';
import { DocumentService } from '../../core/services/document.service';
import { IconComponent } from '../../shared/ui/icon.component';

/** Shows the ORIGINAL document via a short-lived URL (never a public link). */
@Component({
  selector: 'app-document-preview',
  imports: [IconComponent],
  template: `
    <div class="pv" [style.height.px]="height()">
      @if (error()) {
        <div class="msg"><app-icon name="alert" /><span class="small">Pregled nije dostupan{{ offline() ? ' van mreže' : '' }}.</span></div>
      } @else if (!url()) {
        <div class="skeleton" style="width:100%;height:100%"></div>
      } @else if (isImage()) {
        <img [src]="url()" [alt]="'Dokument: ' + doc().title" (error)="imgFailed()" />
      } @else if (isPdf()) {
        <iframe [src]="safeUrl()" [title]="doc().title"></iframe>
      } @else {
        <div class="msg"><app-icon name="file" /><span class="small">Pregled ovog formata nije podržan u pregledaču. Preuzmite dokument.</span></div>
      }
    </div>`,
  styles: [`
    .pv { width: 100%; border-radius: 16px; overflow: hidden; background: #eef2f7; border: 1px solid var(--border); display: grid; place-items: center; }
    img { width: 100%; height: 100%; object-fit: contain; background: #f7f9fc; }
    iframe { width: 100%; height: 100%; border: 0; background: #fff; }
    .msg { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-2); text-align: center; padding: 16px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPreviewComponent implements OnDestroy {
  private readonly docs = inject(DocumentService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly doc = input.required<MedicalDocument>();
  readonly height = input(320);
  readonly url = signal<string | null>(null);
  readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly error = signal(false);
  readonly offline = signal(false);

  constructor() {
    effect(() => {
      const d = this.doc();
      void this.load(d);
    });
  }

  isImage(): boolean {
    return this.doc().mime_type.startsWith('image/');
  }

  isPdf(): boolean {
    return this.doc().mime_type === 'application/pdf';
  }

  private async load(d: MedicalDocument): Promise<void> {
    this.revoke();
    this.error.set(false);
    try {
      const u = await this.docs.url(d);
      this.url.set(u);
      // Signed URL / blob URL of the family's own document.
      this.safeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(u));
    } catch {
      this.offline.set(typeof navigator !== 'undefined' && !navigator.onLine);
      this.error.set(true);
    }
  }

  imgFailed(): void {
    this.error.set(true); // e.g. HEIC outside Safari
  }

  private revoke(): void {
    const u = this.url();
    if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
  }

  ngOnDestroy(): void {
    this.revoke();
  }
}
