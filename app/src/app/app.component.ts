import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHostComponent } from './shared/ui/confirm';
import { ToastHostComponent } from './shared/ui/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `<router-outlet /><app-toast-host /><app-confirm-host />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
