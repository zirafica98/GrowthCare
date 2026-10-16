import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/basics';

@Component({
  selector: 'app-stub-InviteAcceptPage',
  imports: [PageHeaderComponent],
  template: `<div class="page"><app-page-header title="Pozivnica" /><p class="muted">U izradi.</p></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteAcceptPage {}
