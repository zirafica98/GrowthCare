import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { TIMELINE_LABEL, TimelineService } from '../../core/services/timeline.service';
import { formatDate } from '../../core/utils/dates';
import { childData } from '../../shared/child-data';
import { EmptyStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { TL_ICON } from './timeline.page';

/** Global search: documents (incl. OCR text), visits, labs, therapy changes, timeline. */
@Component({
  selector: 'app-search-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, EmptyStateComponent, LoadingSkeletonComponent],
  template: `
    <div class="page">
      <app-page-header title="Pretraga" [subtitle]="children.selected()?.first_name ?? ''" />
      <div class="search">
        <app-icon name="search" />
        <input class="input" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="npr. IGF, endokrinolog, 0.8 mg, oktobar 2026" aria-label="Pretraga" autofocus />
      </div>
      <div class="chips" style="margin:10px 0 14px">
        @for (s of samples; track s) { <button type="button" class="chip" (click)="query.set(s)">{{ s }}</button> }
      </div>
      @if (data.loading()) {
        <app-loading [rows]="3" [height]="56" />
      } @else if (query().trim().length >= 2) {
        <p class="tiny muted" style="margin:0 4px 8px">{{ results().length }} rezultata</p>
        <div class="card" style="padding:4px 12px">
          @for (e of results().slice(0, 100); track e.id + e.type) {
            <a class="list-item" [routerLink]="e.link">
              <span class="icon-tile sm" [class]="'icon-tile sm ' + icons[e.type].tile"><app-icon [name]="icons[e.type].icon" [size]="16" /></span>
              <span class="grow"><b class="small">{{ e.title }}</b><span class="tiny muted" style="display:block">{{ label[e.type] }} · {{ fmt(e.date) }} · {{ e.subtitle }}</span></span>
            </a>
          } @empty { <app-empty-state title="Nema rezultata" text="Probajte drugi pojam ili deo reči." /> }
        </div>
      }
    </div>`,
  styles: [`.search { position: relative; } .search app-icon { position: absolute; left: 14px; top: 12px; color: var(--text-3); } .search .input { padding-left: 44px; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
  readonly children = inject(ChildService);
  private readonly timeline = inject(TimelineService);
  readonly icons = TL_ICON;
  readonly label = TIMELINE_LABEL;
  readonly samples = ['IGF', 'endokrinolog', '0.8 mg', 'oktobar 2026'];
  readonly query = signal('');
  readonly data = childData(async (id) => this.timeline.build(await this.timeline.snapshot(id)));
  readonly results = computed(() => this.timeline.search(this.data.value() ?? [], this.query()));
  fmt = formatDate;
}
