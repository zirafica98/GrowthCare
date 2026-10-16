import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { MedicalDocument } from '../../core/models/models';
import { DocumentService } from '../../core/services/document.service';
import { IconComponent } from '../../shared/ui/icon.component';

/** Pages are rendered once at this pixel width and scaled down with CSS (sharp when zoomed). */
const RENDER_WIDTH = 1400;

/**
 * Shows the ORIGINAL document. PDFs are rendered with pdf.js into fit-to-width
 * pages (the browser's built-in PDF viewer is unreliable on phones and zooms
 * oddly in small frames). Tap opens a full-screen viewer with zoom.
 * The file is fetched through the authorised backend (private storage).
 */
@Component({
  selector: 'app-document-preview',
  imports: [IconComponent],
  template: `
    <div class="pv" [style.height.px]="height()">
      @if (error()) {
        <div class="msg"><app-icon name="alert" /><span class="small">{{ error() }}</span></div>
      } @else if (loading()) {
        <div class="skeleton" style="width:100%;height:100%"></div>
      } @else {
        <button type="button" class="pages" (click)="openFull()" [attr.aria-label]="'Otvori dokument preko celog ekrana: ' + doc().title">
          @if (imageUrl()) {
            <img [src]="imageUrl()" [alt]="'Dokument: ' + doc().title" (error)="imgFailed()" />
          } @else {
            <div #inlineHost class="pdf-host"></div>
          }
        </button>
        <span class="hint"><app-icon name="eye" [size]="14" /> {{ pageCount() > 1 ? pageCount() + ' str. · ' : '' }}dodirni za uvećanje</span>
      }
    </div>

    @if (full()) {
      <div class="full" role="dialog" aria-modal="true" [attr.aria-label]="doc().title">
        <div class="bar">
          <button class="icon-btn" type="button" (click)="closeFull()" aria-label="Zatvori"><app-icon name="x" /></button>
          <span class="grow ellipsis small">{{ doc().title }}</span>
          <button class="icon-btn" type="button" (click)="zoomBy(-0.5)" [disabled]="zoom() <= 1" aria-label="Umanji">−</button>
          <span class="small num">{{ zoom() * 100 }}%</span>
          <button class="icon-btn" type="button" (click)="zoomBy(0.5)" [disabled]="zoom() >= 4" aria-label="Uvećaj">+</button>
          <button class="icon-btn" type="button" (click)="openNative()" aria-label="Otvori original u novom tabu"><app-icon name="download" /></button>
        </div>
        <div class="scroller">
          <div class="zoomer" [style.width.%]="zoom() * 100">
            @if (imageUrl()) {
              <img [src]="imageUrl()" [alt]="'Dokument: ' + doc().title" />
            } @else {
              <div #fullHost class="pdf-host"></div>
            }
          </div>
        </div>
      </div>
    }`,
  styles: [`
    .pv { position: relative; width: 100%; border-radius: 16px; overflow: hidden; background: var(--surface-2); border: 1px solid var(--border); display: grid; place-items: center; }
    .pages { all: unset; display: block; width: 100%; height: 100%; overflow-y: auto; cursor: zoom-in; -webkit-overflow-scrolling: touch; }
    .pages:focus-visible { outline: 3px solid rgba(79,139,247,.5); outline-offset: -3px; }
    .pages img { width: 100%; height: 100%; object-fit: contain; background: var(--surface-2); display: block; }
    .pdf-host { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
    .pdf-host ::ng-deep canvas { width: 100%; height: auto; display: block; background: var(--card); box-shadow: 0 1px 4px rgba(0,0,0,.12); border-radius: 4px; }
    .hint { position: absolute; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 99px; background: rgba(28,39,64,.7); color: #fff; font-size: 11.5px; pointer-events: none; }
    .msg { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-2); text-align: center; padding: 16px; }
    .full { position: fixed; inset: 0; z-index: 120; background: #1b2232; display: flex; flex-direction: column; }
    .bar { display: flex; align-items: center; gap: 4px; padding: calc(6px + var(--safe-top)) 8px 6px; color: #fff; background: rgba(0,0,0,.25); }
    .bar .icon-btn { color: #fff; font-size: 22px; font-weight: 600; }
    .bar .icon-btn:hover { background: rgba(255,255,255,.12); color: #fff; }
    .bar .icon-btn:disabled { opacity: .35; }
    .scroller { flex: 1; overflow: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y pinch-zoom; }
    .zoomer { margin: 0 auto; max-width: none; min-width: 100%; }
    @media (min-width: 900px) { .zoomer { width: min(100%, 900px); } }
    .zoomer img { width: 100%; height: auto; display: block; }
    .zoomer .pdf-host { padding: 12px; gap: 12px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPreviewComponent implements OnDestroy {
  private readonly docs = inject(DocumentService);
  readonly doc = input.required<MedicalDocument>();
  readonly height = input(320);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly pageCount = signal(0);
  readonly full = signal(false);
  readonly zoom = signal(1);

  private readonly inlineHost = viewChild<ElementRef<HTMLDivElement>>('inlineHost');
  private readonly fullHost = viewChild<ElementRef<HTMLDivElement>>('fullHost');
  private canvases: HTMLCanvasElement[] = [];
  private blobUrl: string | null = null;
  private loadSeq = 0;

  constructor() {
    effect(() => {
      const d = this.doc();
      untracked(() => void this.load(d));
    });
    // Attach the rendered pages to whichever container is visible (inline or full screen).
    effect(() => {
      const host = this.full() ? this.fullHost() : this.inlineHost();
      if (host) untracked(() => this.attach(host.nativeElement));
    });
  }

  private async load(d: MedicalDocument): Promise<void> {
    const seq = ++this.loadSeq;
    this.cleanup();
    this.loading.set(true);
    this.error.set(null);
    try {
      const blob = await this.docs.file(d);
      if (seq !== this.loadSeq) return;
      this.blobUrl = URL.createObjectURL(blob);
      if (d.mime_type === 'application/pdf') {
        this.canvases = await this.renderPdf(blob);
        this.pageCount.set(this.canvases.length);
      } else if (d.mime_type.startsWith('image/')) {
        this.imageUrl.set(this.blobUrl);
        this.pageCount.set(1);
      } else {
        throw new Error('unsupported');
      }
    } catch {
      if (seq === this.loadSeq) {
        this.error.set(typeof navigator !== 'undefined' && !navigator.onLine ? 'Pregled nije dostupan van mreže.' : 'Pregled ovog dokumenta nije dostupan. Preuzmite original.');
      }
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  private async renderPdf(blob: Blob): Promise<HTMLCanvasElement[]> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
    const pdf = await task.promise;
    const out: HTMLCanvasElement[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, 30); n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute('aria-label', `Strana ${n}`);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
      out.push(canvas);
    }
    await task.destroy();
    return out;
  }

  private attach(host: HTMLElement): void {
    host.replaceChildren(...this.canvases);
  }

  imgFailed(): void {
    this.error.set('Ovaj format slike pregledač ne može da prikaže (npr. HEIC). Preuzmite original.');
  }

  openFull(): void {
    this.zoom.set(1);
    this.full.set(true);
    document.body.style.overflow = 'hidden';
  }

  closeFull(): void {
    this.full.set(false);
    document.body.style.overflow = '';
  }

  zoomBy(d: number): void {
    this.zoom.set(Math.min(4, Math.max(1, this.zoom() + d)));
  }

  openNative(): void {
    if (this.blobUrl) window.open(this.blobUrl, '_blank', 'noopener');
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.full()) this.closeFull();
  }

  private cleanup(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.imageUrl.set(null);
    this.canvases = [];
    this.pageCount.set(0);
  }

  ngOnDestroy(): void {
    this.cleanup();
    document.body.style.overflow = '';
  }
}
