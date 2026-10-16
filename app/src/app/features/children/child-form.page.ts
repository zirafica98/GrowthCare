import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/ui/basics';
import { ChildFormComponent, ChildFormValue } from './child-form.component';

@Component({
  selector: 'app-child-form-page',
  imports: [PageHeaderComponent, ChildFormComponent],
  template: `
    <div class="page">
      <app-page-header title="Novo dete" [back]="true" />
      <div class="card"><app-child-form submitLabel="Dodaj dete" [busy]="busy()" (saved)="save($event)" /></div>
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChildFormPage {
  private readonly children = inject(ChildService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly busy = signal(false);

  async save(v: ChildFormValue): Promise<void> {
    this.busy.set(true);
    try {
      const c = await this.children.add(v);
      this.toast.success(`${c.first_name} je dodat/a i sada je izabrano dete.`);
      await this.router.navigateByUrl('/app/therapy');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }
}
