import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { TimelineService } from '../../core/services/timeline.service';
import { ToastService } from '../../core/services/toast.service';
import { VisitService } from '../../core/services/visit.service';
import { formatAge, formatDate, formatDateTime } from '../../core/utils/dates';
import { series } from '../../core/utils/growth';
import { ChildAvatarComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';
import { ChildFormComponent, ChildFormValue } from './child-form.component';
import { ChildSnapshot } from '../../core/services/timeline.service';

@Component({
  selector: 'app-child-profile-page',
  imports: [PageHeaderComponent, IconComponent, ChildAvatarComponent, SheetComponent, ChildFormComponent],
  template: `
    <div class="page">
      <app-page-header title="Profil deteta" [back]="true" backLink="/app/family" />
      @if (child(); as c) {
        <section class="card stack" style="align-items:center; text-align:center">
          <app-child-avatar [child]="c" [size]="84" />
          <div><h2>{{ children.displayName(c) }}</h2><p class="muted">{{ age() }} · rođen/a {{ fmt(c.date_of_birth) }}{{ c.sex ? ' · ' + (c.sex === 'male' ? 'dečak' : 'devojčica') : '' }}</p></div>
          <div class="row">
            <button class="btn outline sm" type="button" (click)="editOpen.set(true)"><app-icon name="edit" [size]="16" /> Izmeni</button>
            @if (children.selectedChildId() !== c.id) { <button class="btn primary sm" type="button" (click)="select()">Izaberi dete</button> }
          </div>
        </section>
        @if (snap(); as s) {
          <div class="grid-2" style="margin-top:12px">
            <div class="card"><div class="small muted">Terapija</div><b>{{ activeMed(s) }}</b></div>
            <div class="card"><div class="small muted">Sledeća kontrola</div><b>{{ nextVisit(s) }}</b></div>
            <div class="card"><div class="small muted">Visina</div><b>{{ last(s, 'height_cm', 'cm') }}</b></div>
            <div class="card"><div class="small muted">Težina</div><b>{{ last(s, 'weight_kg', 'kg') }}</b></div>
          </div>
        }
        @if (c.birth_weight_g || c.birth_length_cm) {
          <p class="small muted" style="margin:12px 4px">Na rođenju: {{ c.birth_weight_g ? c.birth_weight_g + ' g' : '' }}{{ c.birth_weight_g && c.birth_length_cm ? ', ' : '' }}{{ c.birth_length_cm ? c.birth_length_cm + ' cm' : '' }}</p>
        }
        <button class="btn ghost block" type="button" style="margin-top:20px; color:var(--danger)" (click)="remove()"><app-icon name="trash" [size]="18" /> Obriši dete i sve njegove podatke</button>

        <app-sheet [open]="editOpen()" title="Izmeni podatke" (closed)="editOpen.set(false)">
          @if (editOpen()) { <app-child-form [initial]="c" [busy]="busy()" (saved)="save($event)" /> }
        </app-sheet>
      } @else {
        <p class="muted">Dete nije pronađeno.</p>
      }
    </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChildProfilePage {
  readonly id = input.required<string>();
  readonly children = inject(ChildService);
  private readonly timeline = inject(TimelineService);
  private readonly visits = inject(VisitService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  readonly child = computed(() => this.children.children().find((c) => c.id === this.id()) ?? null);
  readonly snap = signal<ChildSnapshot | null>(null);
  readonly editOpen = signal(false);
  readonly busy = signal(false);
  fmt = formatDate;

  constructor() {
    queueMicrotask(async () => {
      try {
        this.snap.set(await this.timeline.snapshot(this.id()));
      } catch {
        /* shown as empty */
      }
    });
  }

  age(): string {
    return this.child() ? formatAge(this.child()!.date_of_birth) : '';
  }

  activeMed(s: ChildSnapshot): string {
    const m = s.medications.find((x) => x.active);
    return m ? `${m.name} ${m.current_dose} ${m.dose_unit}` : 'Nema';
  }

  nextVisit(s: ChildSnapshot): string {
    const v = s.visits.filter((x) => x.status === 'scheduled' && Date.parse(x.scheduled_at) > Date.now())[0];
    return v ? formatDateTime(v.scheduled_at) : '—';
  }

  last(s: ChildSnapshot, metric: 'height_cm' | 'weight_kg', unit: string): string {
    const p = series(s.measurements, metric).at(-1);
    return p ? `${p.value} ${unit}` : '—';
  }

  select(): void {
    this.children.select(this.id());
    void this.router.navigateByUrl('/app/dashboard');
  }

  async save(v: ChildFormValue): Promise<void> {
    this.busy.set(true);
    try {
      await this.children.update(this.id(), v);
      this.editOpen.set(false);
      this.toast.success('Podaci su sačuvani.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const c = this.child();
    if (!c) return;
    const ok = await this.confirm.ask({
      title: `Obrisati ${c.first_name}?`, danger: true, confirmText: 'Obriši trajno', typeToConfirm: c.first_name,
      message: 'Trajno se brišu svi podaci deteta: doze, terapija, merenja, kontrole, laboratorija, dokumenti i podsetnici. Ovo se ne može vratiti.',
    });
    if (!ok) return;
    try {
      await this.children.remove(c.id);
      this.toast.success('Dete i njegovi podaci su obrisani.');
      await this.router.navigateByUrl('/app/family');
    } catch (e) {
      this.toast.error(e);
    }
  }
}
