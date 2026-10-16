import { ChangeDetectionStrategy, Component, ElementRef, effect, HostListener, input, OnDestroy, output, viewChild } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Accessible modal: bottom sheet on phones, centred dialog on larger screens.
 * Focus moves into the dialog on open and returns on close; Esc closes.
 */
@Component({
  selector: 'app-sheet',
  imports: [IconComponent],
  template: `
    @if (open()) {
      <div class="backdrop" (click)="dismiss()" aria-hidden="true"></div>
      <section #panel class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="title()" tabindex="-1">
        <div class="grab" aria-hidden="true"></div>
        <header>
          <h2>{{ title() }}</h2>
          <button class="icon-btn" type="button" (click)="dismiss()" aria-label="Zatvori"><app-icon name="x" /></button>
        </header>
        <div class="body"><ng-content /></div>
      </section>
    }`,
  styles: [`
    .backdrop { position: fixed; inset: 0; background: rgba(20, 30, 50, .38); z-index: 80; animation: fade .15s ease; }
    .sheet {
      position: fixed; z-index: 81; left: 0; right: 0; bottom: 0; max-height: 92vh; overflow: auto;
      background: var(--card); border-radius: 24px 24px 0 0; box-shadow: var(--shadow-lg);
      padding: 6px 18px calc(18px + var(--safe-bottom)); animation: up .2s ease;
    }
    .grab { width: 40px; height: 5px; border-radius: 99px; background: var(--track); margin: 4px auto 6px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 8px; position: sticky; top: -6px; background: var(--card); padding: 6px 0 10px; z-index: 1; }
    header h2 { font-size: 19px; }
    .sheet:focus { outline: none; }
    @media (min-width: 720px) {
      .sheet { left: 50%; right: auto; bottom: auto; top: 50%; transform: translate(-50%, -50%); width: min(560px, 92vw); border-radius: 24px; animation: pop .18s ease; max-height: 88vh; }
      .grab { display: none; }
    }
    @keyframes fade { from { opacity: 0; } }
    @keyframes up { from { transform: translateY(30px); opacity: .4; } }
    @keyframes pop { from { transform: translate(-50%, -48%); opacity: .4; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetComponent implements OnDestroy {
  readonly open = input(false);
  readonly title = input('');
  readonly closed = output<void>();
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private previousFocus: Element | null = null;

  constructor() {
    effect(() => {
      const p = this.panel();
      if (p) {
        this.previousFocus = document.activeElement;
        queueMicrotask(() => {
          const first = p.nativeElement.querySelector<HTMLElement>('input, select, textarea, button.btn');
          (first ?? p.nativeElement).focus({ preventScroll: true });
        });
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
        (this.previousFocus as HTMLElement | null)?.focus?.();
      }
    });
  }

  /** Never leave the page scroll-locked if the sheet is destroyed while open (e.g. navigation). */
  ngOnDestroy(): void {
    if (this.panel()) document.body.style.overflow = '';
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open()) this.dismiss();
  }

  dismiss(): void {
    this.closed.emit();
  }
}
