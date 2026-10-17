import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { ReminderService } from '../../core/services/reminder.service';
import { VISIT_STATUS_LABEL, VisitService } from '../../core/services/visit.service';
import { formatDateTime, relativeDays } from '../../core/utils/dates';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';
import { VisitFormComponent } from './visit-form.component';

@Component({
  selector: 'app-visits-page',
  imports: [RouterLink, PageHeaderComponent, IconComponent, SheetComponent, VisitFormComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Kontrole i pregledi" [subtitle]="children.selected()?.first_name ?? ''" />
      <div class="segmented" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'upcoming'" (click)="tab.set('upcoming')">Predstojeće</button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'past'" (click)="tab.set('past')">Istorija</button>
      </div>
      <div style="height:12px"></div>
      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <app-loading [rows]="3" [height]="76" />
      } @else {
        @if (tab() === 'upcoming' && list()[0]; as next) {
          <a class="card next row" [routerLink]="['/app/doctors', next.id]">
            <img src="illustrations/doctor.png" alt="" width="70" height="92" />
            <div class="grow">
              <div class="small muted">Sledeća kontrola · {{ rel(next.scheduled_at) }}</div>
              <b>{{ fmt(next.scheduled_at) }}</b>
              <div class="small muted">{{ visits.label(next) }}{{ doctor(next.doctor_id) ? ' · ' + doctor(next.doctor_id) : '' }}</div>
            </div>
          </a>
        }
        <div class="stack sm">
          @for (v of (tab() === 'upcoming' ? list().slice(1) : list()); track v.id) {
            <a class="card link row" [routerLink]="['/app/doctors', v.id]">
              <div class="icon-tile" [class.violet]="v.status === 'scheduled'" [class.success]="v.status === 'completed'"><app-icon [name]="icon(v)" /></div>
              <div class="grow">
                <b>{{ visits.label(v) }}</b>
                <div class="small muted">{{ fmt(v.scheduled_at) }}{{ doctor(v.doctor_id) ? ' · ' + doctor(v.doctor_id) : '' }}</div>
                @if (v.status === 'scheduled') { <span class="badge info" style="margin-top:4px">{{ rel(v.scheduled_at) }}</span> }
                @else { <span class="badge" [class.success]="v.status === 'completed'" style="margin-top:4px">{{ statusLabel[v.status] }}</span> }
              </div>
              @if (withReminders().has(v.id)) { <app-icon name="bell" [size]="18" /> }
            </a>
          } @empty {
            @if (!list().length) { <app-empty-state [title]="tab() === 'upcoming' ? 'Nema zakazanih kontrola' : 'Nema prethodnih kontrola'" image="illustrations/f-visit.png" /> }
          }
        </div>
        <button class="btn outline primary-text block" type="button" style="margin-top:14px" (click)="formOpen.set(true)"><app-icon name="plus" [size]="18" /> Dodaj kontrolu</button>
      }
    </div>
    <app-sheet [open]="formOpen()" title="Nova kontrola" (closed)="formOpen.set(false)">
      @if (formOpen()) { <app-visit-form (saved)="formOpen.set(false)" /> }
    </app-sheet>`,
  styles: [`.next { margin-bottom: 12px; background: linear-gradient(135deg, var(--violet-soft), var(--card)); text-decoration: none !important; color: inherit; } .next img { width: 64px; height: auto; border-radius: 14px; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisitsPage {
  readonly children = inject(ChildService);
  readonly visits = inject(VisitService);
  private readonly family = inject(FamilyService);
  private readonly reminders = inject(ReminderService);
  readonly statusLabel = VISIT_STATUS_LABEL;
  readonly tab = signal<'upcoming' | 'past'>('upcoming');
  readonly formOpen = signal(false);

  readonly data = childData(async (id) => {
    const [visits, reminders] = await Promise.all([this.visits.list(id), this.reminders.list(id)]);
    return { visits, reminders };
  });

  readonly withReminders = computed(() => new Set((this.data.value()?.reminders ?? []).filter((r) => r.related_entity_type === 'doctor_visit' && r.enabled).map((r) => r.related_entity_id)));
  readonly list = computed(() => {
    const now = Date.now();
    const all = this.data.value()?.visits ?? [];
    return this.tab() === 'upcoming'
      ? all.filter((v) => v.status === 'scheduled' && Date.parse(v.scheduled_at) >= now - 3_600_000)
      : all.filter((v) => !(v.status === 'scheduled' && Date.parse(v.scheduled_at) >= now - 3_600_000)).reverse();
  });

  fmt = formatDateTime;
  rel(iso: string): string {
    return relativeDays(new Date(iso));
  }
  doctor(id: string | null): string {
    return this.family.doctors().find((d) => d.id === id)?.name ?? '';
  }
  icon(v: { reason: string | null }): string {
    return /lab/i.test(v.reason ?? '') ? 'flask' : 'stethoscope';
  }
}
