import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { IconComponent } from './icon.component';
import { SheetComponent } from './sheet.component';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Optional "what changes" rows, e.g. previous → new dose. */
  details?: { label: string; value: string }[];
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** For destructive actions: user must type this word to enable the button. */
  typeToConfirm?: string;
}

/** Promise-based confirmation dialog (destructive actions, therapy edits). */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) => this.current.set({ ...opts, resolve }));
  }

  close(result: boolean): void {
    this.current()?.resolve(result);
    this.current.set(null);
  }
}

@Component({
  selector: 'app-confirm-host',
  imports: [SheetComponent, IconComponent],
  template: `
    @let c = svc.current();
    <app-sheet [open]="!!c" [title]="c?.title ?? ''" (closed)="svc.close(false)">
      @if (c) {
        <div class="stack">
          @if (c.danger) { <div class="notice danger"><app-icon name="alert" [size]="18" /><span>{{ c.message }}</span></div> }
          @else { <p class="muted">{{ c.message }}</p> }
          @if (c.details?.length) {
            <div class="card flat tight">
              @for (d of c.details; track d.label) {
                <div class="row between small" style="padding:4px 0"><span class="muted">{{ d.label }}</span><b class="num">{{ d.value }}</b></div>
              }
            </div>
          }
          @if (c.typeToConfirm) {
            <div class="field">
              <label for="ttc">Upišite „{{ c.typeToConfirm }}” da potvrdite</label>
              <input id="ttc" class="input" autocomplete="off" (input)="typed.set($any($event.target).value)" />
            </div>
          }
          <div class="row" style="justify-content:flex-end; gap:10px; margin-top:6px">
            <button class="btn outline" type="button" (click)="svc.close(false)">{{ c.cancelText ?? 'Otkaži' }}</button>
            <button class="btn" type="button" [class.danger]="c.danger" [class.primary]="!c.danger"
              [disabled]="!!c.typeToConfirm && typed().trim().toLowerCase() !== c.typeToConfirm.toLowerCase()"
              (click)="svc.close(true); typed.set('')">{{ c.confirmText ?? 'Potvrdi' }}</button>
          </div>
        </div>
      }
    </app-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmHostComponent {
  readonly svc = inject(ConfirmService);
  readonly typed = signal('');
}
