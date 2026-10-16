import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-toast-host',
  imports: [IconComponent],
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="false">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind" role="status">
          <app-icon [name]="t.kind === 'success' ? 'check-circle' : t.kind === 'error' ? 'x-circle' : t.kind === 'warning' ? 'alert' : 'info'" [size]="20" />
          <span class="grow">{{ t.message }}</span>
          <button class="icon-btn" type="button" (click)="toasts.dismiss(t.id)" aria-label="Zatvori obaveštenje"><app-icon name="x" [size]="16" /></button>
        </div>
      }
    </div>`,
  styles: [`
    .toasts { position: fixed; z-index: 100; left: 12px; right: 12px; top: calc(12px + var(--safe-top)); display: flex; flex-direction: column; gap: 8px; pointer-events: none; align-items: center; }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 14px; border-radius: 16px; background: var(--card); box-shadow: var(--shadow-lg); border: 1px solid var(--border); width: min(480px, 100%); font-size: 14px; font-weight: 500; animation: drop .2s ease; }
    .toast .icon-btn { width: 36px; height: 36px; }
    .toast.success app-icon:first-child { color: var(--success); }
    .toast.error app-icon:first-child { color: var(--danger); }
    .toast.warning app-icon:first-child { color: var(--warning-accent); }
    .toast.info app-icon:first-child { color: var(--primary); }
    @keyframes drop { from { transform: translateY(-10px); opacity: 0; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  readonly toasts = inject(ToastService);
}
