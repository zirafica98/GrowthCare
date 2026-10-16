import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { TimelineService } from '../../core/services/timeline.service';
import { VisitService } from '../../core/services/visit.service';
import { addDays, addMonths, formatDate, isoWeekday, monthLabel, sameDay, startOfDay, toLocalDate, toLocalTime, WEEKDAYS_SHORT_SR } from '../../core/utils/dates';
import { expectedSlots, STATUS_LABEL } from '../../core/utils/dose-schedule';
import { occurrences } from '../../core/utils/recurrence';
import { childData } from '../../shared/child-data';
import { ErrorStateComponent, LoadingSkeletonComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';
import { VisitFormComponent } from '../doctors/visit-form.component';

type Kind = 'dose' | 'visit' | 'lab' | 'measurement' | 'reminder' | 'therapy';

interface CalEvent {
  id: string;
  kind: Kind;
  at: Date;
  title: string;
  sub: string;
  status?: string;
  tone?: string;
  link: string;
}

const KIND: Record<Kind, { label: string; icon: string; tile: string; dot: string }> = {
  dose: { label: 'Doze', icon: 'syringe', tile: 'success', dot: '#10b981' },
  visit: { label: 'Kontrole', icon: 'stethoscope', tile: 'violet', dot: '#6d5bd0' },
  lab: { label: 'Laboratorija', icon: 'flask', tile: '', dot: '#2f6fe4' },
  measurement: { label: 'Merenja', icon: 'ruler', tile: 'warning', dot: '#f59e0b' },
  reminder: { label: 'Podsetnici', icon: 'bell', tile: 'pink', dot: '#f27ba0' },
  therapy: { label: 'Terapija', icon: 'pill', tile: '', dot: '#2459c2' },
};

@Component({
  selector: 'app-calendar-page',
  imports: [NgTemplateOutlet, RouterLink, PageHeaderComponent, IconComponent, SheetComponent, VisitFormComponent, LoadingSkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Kalendar" [subtitle]="children.selected()?.first_name ?? ''">
        <button class="btn primary sm" type="button" (click)="addOpen.set(true)"><app-icon name="plus" [size]="16" /> Kontrola</button>
      </app-page-header>

      <div class="segmented" role="tablist" aria-label="Prikaz">
        <button type="button" role="tab" [attr.aria-selected]="mode() === 'month'" (click)="mode.set('month')">Mesec</button>
        <button type="button" role="tab" [attr.aria-selected]="mode() === 'week'" (click)="mode.set('week')">Nedelja</button>
        <button type="button" role="tab" [attr.aria-selected]="mode() === 'list'" (click)="mode.set('list')">Lista</button>
      </div>

      @if (data.error()) {
        <app-error-state [message]="data.error()!.message" (retry)="data.reload()" />
      } @else if (data.loading()) {
        <div style="height:12px"></div><app-loading [rows]="1" [height]="300" />
      } @else {
        @if (mode() !== 'list') {
          <section class="card" style="margin-top:12px">
            <div class="row between" style="margin-bottom:8px">
              <button class="icon-btn" type="button" (click)="move(-1)" aria-label="Prethodno"><app-icon name="chevron-left" /></button>
              <b>{{ mode() === 'month' ? monthLabel(cursor()) : weekLabel() }}</b>
              <button class="icon-btn" type="button" (click)="move(1)" aria-label="Sledeće"><app-icon name="chevron-right" /></button>
            </div>
            <div class="grid head" aria-hidden="true">@for (w of weekdays; track w) { <span>{{ w }}</span> }</div>
            <div class="grid" role="grid" aria-label="Dani">
              @for (d of days(); track d.key) {
                <button type="button" class="day" role="gridcell" [class.out]="!d.inMonth" [class.today]="d.today" [class.sel]="d.key === selectedKey()"
                  [attr.aria-label]="d.label + (d.kinds.length ? ', ' + d.count + ' događaja' : '')" (click)="selected.set(d.date)">
                  <span class="n">{{ d.date.getDate() }}</span>
                  <span class="dots">@for (k of d.kinds; track k) { <i [style.background]="kindInfo[k].dot"></i> }</span>
                </button>
              }
            </div>
            <div class="legend">@for (k of legend; track k) { <span><i [style.background]="kindInfo[k].dot"></i>{{ kindInfo[k].label }}</span> }</div>
          </section>

          <div class="section-title"><h3>{{ selectedTitle() }}</h3></div>
          <div class="card" style="padding:4px 12px">
            @for (e of dayEvents(); track e.id) { <ng-container *ngTemplateOutlet="row; context: { $implicit: e }" /> }
            @empty { <p class="small muted" style="padding:12px 0">Nema događaja.</p> }
          </div>
        } @else {
          <div style="height:12px"></div>
          @for (g of upcomingGroups(); track g.key) {
            <h4 class="gh">{{ g.label }}</h4>
            <div class="card" style="padding:4px 12px">
              @for (e of g.events; track e.id) {
                <a class="list-item" [routerLink]="e.link">
                  <span class="icon-tile sm" [class]="'icon-tile sm ' + kindInfo[e.kind].tile"><app-icon [name]="kindInfo[e.kind].icon" [size]="16" /></span>
                  <span class="grow"><b class="small">{{ e.title }}</b><span class="tiny muted" style="display:block">{{ time(e.at) }} · {{ e.sub }}</span></span>
                </a>
              }
            </div>
          } @empty { <p class="muted small">Nema predstojećih događaja u narednih 60 dana.</p> }
        }
      }
    </div>

    <ng-template #row let-e>
      <a class="list-item" [routerLink]="e.link">
        <span class="icon-tile sm" [class]="'icon-tile sm ' + tileOf(e)"><app-icon [name]="iconOf(e)" [size]="16" /></span>
        <span class="grow"><b class="small">{{ e.title }}</b><span class="tiny muted" style="display:block">{{ time(e.at) }} · {{ e.sub }}</span></span>
        @if (e.status) { <span class="badge" [class]="'badge ' + e.tone">{{ e.status }}</span> }
      </a>
    </ng-template>

    <app-sheet [open]="addOpen()" title="Nova kontrola" (closed)="addOpen.set(false)">
      @if (addOpen()) { <app-visit-form [defaultDate]="selectedKey()" (saved)="addOpen.set(false)" /> }
    </app-sheet>`,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .grid.head span { text-align: center; font-size: 11.5px; color: var(--text-3); font-weight: 600; padding: 4px 0; }
    .day { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0 4px; min-height: 46px; border: 0; background: none; border-radius: 12px; cursor: pointer; color: var(--text); }
    .day .n { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; font-size: 14px; font-weight: 600; }
    .day.out { color: var(--text-3); }
    .day.today .n { background: var(--primary-soft); color: var(--primary-strong); }
    .day.sel .n { background: var(--primary); color: #fff; }
    .day:hover { background: var(--primary-softer); }
    .dots { display: flex; gap: 2px; height: 6px; }
    .dots i, .legend i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; font-size: 12px; color: var(--text-2); }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    .gh { margin: 14px 4px 8px; font-size: 13px; color: var(--text-2); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPage {
  readonly children = inject(ChildService);
  private readonly timeline = inject(TimelineService);
  private readonly visits = inject(VisitService);
  readonly kindInfo = KIND;
  readonly legend: Kind[] = ['dose', 'visit', 'lab', 'measurement', 'reminder', 'therapy'];
  readonly weekdays = WEEKDAYS_SHORT_SR;
  readonly monthLabel = monthLabel;
  readonly mode = signal<'month' | 'week' | 'list'>('month');
  readonly cursor = signal(startOfDay(new Date()));
  readonly selected = signal(startOfDay(new Date()));
  readonly addOpen = signal(false);
  readonly data = childData((id) => this.timeline.snapshot(id));

  readonly selectedKey = computed(() => toLocalDate(this.selected()));

  readonly range = computed(() => {
    const c = this.cursor();
    if (this.mode() === 'week') {
      const s = addDays(c, 1 - isoWeekday(c));
      return { from: s, to: addDays(s, 6) };
    }
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const from = addDays(first, 1 - isoWeekday(first));
    const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
    return { from, to: addDays(last, 7 - isoWeekday(last)) };
  });

  /** Combined events for a date range (doses, visits, labs, measurements, reminders, therapy changes). */
  private eventsBetween(from: Date, to: Date): CalEvent[] {
    const s = this.data.value();
    if (!s) return [];
    const end = addDays(to, 1);
    const out: CalEvent[] = [];
    const now = new Date();
    for (const slot of expectedSlots(s.medications, s.injections, from, to, now)) {
      out.push({
        id: `d${slot.medication.id}${slot.scheduledFor}`, kind: 'dose', at: new Date(slot.record?.administered_at ?? slot.scheduledFor),
        title: `${slot.medication.name} · ${slot.record?.dose ?? slot.medication.current_dose} ${slot.medication.dose_unit}`,
        sub: STATUS_LABEL[slot.status], status: STATUS_LABEL[slot.status],
        tone: slot.status === 'given' ? 'success' : slot.status === 'pending' ? 'info' : slot.status === 'skipped' ? 'warning' : 'danger', link: '/app/history',
      });
    }
    for (const v of s.visits) {
      const at = new Date(v.scheduled_at);
      if (at >= from && at < end) out.push({ id: v.id, kind: 'visit', at, title: this.visits.label(v), sub: v.reason ?? 'Kontrola', link: `/app/doctors/${v.id}`, status: v.status === 'completed' ? 'Obavljeno' : v.status === 'cancelled' ? 'Otkazano' : '', tone: v.status === 'completed' ? 'success' : '' });
    }
    for (const t of s.labs) {
      const at = new Date(t.collected_at);
      if (at >= from && at < end) out.push({ id: t.id, kind: 'lab', at, title: 'Laboratorija', sub: t.results.slice(0, 3).map((r) => r.test_name).join(', '), link: '/app/laboratory' });
    }
    for (const m of s.measurements) {
      const at = new Date(m.measured_at);
      if (at >= from && at < end) out.push({ id: m.id, kind: 'measurement', at, title: 'Merenje visine/težine', sub: [m.height_cm ? `${m.height_cm} cm` : '', m.weight_kg ? `${m.weight_kg} kg` : ''].filter(Boolean).join(' · '), link: '/app/growth' });
    }
    for (const c of s.changes) {
      const at = new Date(`${c.changed_at}T12:00:00`);
      if (at >= from && at < end) out.push({ id: c.id, kind: 'therapy', at, title: c.previous_dose == null ? 'Početak terapije' : 'Promena doze', sub: `${c.previous_dose ?? ''}${c.previous_dose != null ? ' → ' : ''}${c.new_dose} ${c.dose_unit}`, link: '/app/therapy' });
    }
    for (const r of s.reminders.filter((x) => x.enabled && x.type !== 'dose' && x.type !== 'appointment')) {
      for (const at of occurrences(r, from, end, 60)) out.push({ id: `${r.id}${at.toISOString()}`, kind: r.type === 'laboratory' ? 'lab' : r.type === 'measurement' ? 'measurement' : 'reminder', at, title: r.title, sub: 'Podsetnik', link: '/app/reminders' });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  readonly rangeEvents = computed(() => this.eventsBetween(this.range().from, this.range().to));

  readonly days = computed(() => {
    const { from, to } = this.range();
    const evs = this.rangeEvents();
    const today = new Date();
    const out = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const list = evs.filter((e) => sameDay(e.at, d));
      out.push({
        key: toLocalDate(d), date: new Date(d), inMonth: this.mode() === 'week' || d.getMonth() === this.cursor().getMonth(),
        today: sameDay(d, today), kinds: [...new Set(list.map((e) => e.kind))].slice(0, 4), count: list.length, label: formatDate(d),
      });
    }
    return out;
  });

  readonly dayEvents = computed(() => this.eventsBetween(this.selected(), this.selected()));
  readonly selectedTitle = computed(() => (sameDay(this.selected(), new Date()) ? 'Današnji događaji' : formatDate(this.selected())));

  readonly upcomingGroups = computed(() => {
    const from = startOfDay(new Date());
    const evs = this.eventsBetween(from, addDays(from, 60)).filter((e) => e.kind !== 'dose' || sameDay(e.at, from));
    const map = new Map<string, CalEvent[]>();
    for (const e of evs) map.set(toLocalDate(e.at), [...(map.get(toLocalDate(e.at)) ?? []), e]);
    return [...map.entries()].map(([key, events]) => ({ key, label: sameDay(new Date(`${key}T12:00`), from) ? 'Danas' : `${WEEKDAYS_SHORT_SR[isoWeekday(new Date(`${key}T12:00`)) - 1]}, ${formatDate(key)}`, events }));
  });

  tileOf(e: CalEvent): string {
    return KIND[e.kind].tile;
  }

  iconOf(e: CalEvent): string {
    return KIND[e.kind].icon;
  }

  time(d: Date): string {
    return toLocalTime(d);
  }

  weekLabel(): string {
    const { from, to } = this.range();
    return `${formatDate(from)} – ${formatDate(to)}`;
  }

  move(n: number): void {
    const c = this.cursor();
    const next = this.mode() === 'week' ? addDays(c, 7 * n) : addMonths(new Date(c.getFullYear(), c.getMonth(), 1), n);
    this.cursor.set(next);
    this.selected.set(next);
  }
}
