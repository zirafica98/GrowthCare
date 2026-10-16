import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ConfirmHostComponent } from './shared/ui/confirm';
import { ToastHostComponent } from './shared/ui/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `<router-outlet /><app-toast-host /><app-confirm-host />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  constructor() {
    // PWA: pick up new deployments instead of serving the cached old version.
    const sw = inject(SwUpdate);
    if (!sw.isEnabled) return;
    sw.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => {
      // Never reload while a sheet/dialog (possibly with unsaved input) is open.
      if (!document.querySelector('[role="dialog"]')) document.location.reload();
    });
    sw.unrecoverable.subscribe(() => document.location.reload());
    const check = () => void sw.checkForUpdate().catch(() => undefined);
    check();
    setInterval(check, 15 * 60_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  }
}
