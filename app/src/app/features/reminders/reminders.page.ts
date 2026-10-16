import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared/ui/basics';

@Component({
  selector: 'app-stub-RemindersPage',
  imports: [PageHeaderComponent],
  template: `<div class="page"><app-page-header title="Podsetnici" /><p class="muted">U izradi.</p></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemindersPage {}
