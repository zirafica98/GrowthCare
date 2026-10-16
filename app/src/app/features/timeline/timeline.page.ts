import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { TIMELINE_LABEL, TimelineEvent, TimelineService, TimelineType } from '../../core/services/timeline.service';
import { formatDate, toLocalTime } from '../../core/utils/dates';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';

export const TL_ICON: Record<TimelineType, { icon: string; tile: string }> = {
  injection: { icon: 'syringe', tile: 'success' }, skipped: { icon: 'syringe', tile: 'warning' }, measurement: { icon: 'ruler', tile: '' },
  visit: { icon: 'stethoscope', tile: 'violet' }, lab: { icon: 'flask', tile: '' }, document: { icon: 'file', tile: 'pink' },
  therapy: { icon: 'pill', tile: '' }, reminder: { icon: 'bell', tile: '' },
};

/** Unified chronological history (design: "Istorija"). */
@Component({
  selector: 'app-timeline-page',
  imports: [RouterLink, PageHeaderComponent, IconComponent, EmptyStateComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Hronologija" [subtitle]="children.selected()?.first_name ?? ''">
        <a class="icon-btn" routerLink="/app/search" aria-label="Pretraga"><app-icon name="search" /></a>
      </app-page-header>
      <div class="chips scroll" role="group" aria-label="Vrsta događaja">
        <button type="button" class="chip" [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">Sve</button>
        @for (t of types; track t) { <button type="button" class="chip" [attr.aria-pressed]="filter() === t" (click)="filter.set(t)">{{ label[t] }}</button> }
      </div>
      <div style="height:12px"></div>
      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <app-loading [rows]="6" [height]="56" />
      } @else {
        <ol class="tl">
          @for (e of visible(); track e.id + e.type) {
            <li>
              <span class="icon-tile sm" [class]="'icon-tile sm ' + icons[e.type].tile"><app-icon [name]="icons[e.type].icon" [size]="16" /></span>
              <a class="body" [routerLink]="e.link">
                <span class="tiny muted">{{ fmt(e.date) }} · {{ time(e.date) }}</span>
                <b class="small">{{ e.title }}</b>
                <span class="tiny muted">{{ e.subtitle }}</span>
              </a>
              @if (e.badge) { <span class="badge" [class]="'badge ' + e.badge.tone">{{ e.badge.label }}</span> }
            </li>
          } @empty { <app-empty-state title="Nema događaja" image="illustrations/e-data.png" /> }
        </ol>
        @if (filtered().length > limit()) { <button class="btn outline block" type="button" (click)="limit.set(limit() + 50)">Prikaži još</button> }
      }
    </div>`,
  styles: [`
    .chips.scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } .chips.scroll .chip { flex: 0 0 auto; }
    .tl { list-style: none; margin: 0; padding: 0 0 0 4px; position: relative; }
    .tl::before { content: ''; position: absolute; left: 20px; top: 8px; bottom: 8px; width: 2px; background: var(--border); }
    .tl li { position: relative; display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; }
    .tl .icon-tile { position: relative; z-index: 1; box-shadow: 0 0 0 4px var(--bg); }
    .body { display: flex; flex-direction: column; flex: 1; min-width: 0; color: inherit; text-decoration: none !important; background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px; }
    .tl .badge { position: absolute; right: 10px; top: 16px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePage {
  readonly children = inject(ChildService);
  private readonly timeline = inject(TimelineService);
  readonly icons = TL_ICON;
  readonly label = TIMELINE_LABEL;
  readonly types: TimelineType[] = ['injection', 'skipped', 'measurement', 'visit', 'lab', 'document', 'therapy'];
  readonly filter = signal<TimelineType | 'all'>('all');
  readonly limit = signal(60);
  readonly data = childData(async (id) => this.timeline.build(await this.timeline.snapshot(id)));
  readonly filtered = computed<TimelineEvent[]>(() => (this.data.value() ?? []).filter((e) => Date.parse(e.date) <= Date.now() + 86_400_000 * 365 && (this.filter() === 'all' || e.type === this.filter())));
  readonly visible = computed(() => this.filtered().slice(0, this.limit()));
  fmt = formatDate;
  time(iso: string): string {
    return toLocalTime(new Date(iso));
  }
}
