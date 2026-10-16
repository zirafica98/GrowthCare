import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Child, InjectionStatus } from '../../core/models/models';
import { STATUS_LABEL } from '../../core/utils/dose-schedule';
import { IconComponent } from './icon.component';

/** GrowthCare heart logo (vector re-creation of the design mark). */
@Component({
  selector: 'app-logo',
  template: `
    <span class="logo" [class.stacked]="stacked()">
      <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="gcg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#5b9bff" /><stop offset="1" stop-color="#2459c2" />
          </linearGradient>
        </defs>
        <path d="M32 58C14 46 4 35 4 22 4 12 11.5 5 20.5 5c5 0 9 2.3 11.5 6 2.5-3.7 6.5-6 11.5-6C52.5 5 60 12 60 22c0 13-10 24-28 36Z" fill="url(#gcg)" />
        <circle cx="25" cy="21" r="5.2" fill="#fff" />
        <circle cx="40" cy="25" r="4.2" fill="#fff" />
        <path d="M14 38c2-7 6.5-10.5 11-10.5 3 0 5.5 1.3 7.3 3.6" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" />
        <path d="M32 47.5c-5.5-3.6-8-6.6-8-9.8 0-2.5 1.9-4.4 4.2-4.4 1.6 0 2.9.8 3.8 2.1.9-1.3 2.2-2.1 3.8-2.1 2.3 0 4.2 1.9 4.2 4.4 0 3.2-2.5 6.2-8 9.8Z" fill="#f27ba0" stroke="#fff" stroke-width="1.6" />
      </svg>
      @if (withText()) {
        <span class="word">Growth<b>Care</b></span>
      }
    </span>`,
  styles: [`
    .logo { display: inline-flex; align-items: center; gap: 8px; }
    .logo.stacked { flex-direction: column; gap: 6px; }
    .word { font-weight: 750; font-size: 22px; letter-spacing: -0.02em; color: var(--logo-a); }
    .word b { font-weight: 750; color: var(--logo-b); }
    .stacked .word { font-size: 30px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoComponent {
  readonly size = input(36);
  readonly withText = input(true);
  readonly stacked = input(false);
}

/** Child avatar: initials on the child's colour (photos optional, not stored by default). */
@Component({
  selector: 'app-child-avatar',
  template: `<span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.background]="child()?.avatar_color || '#DCEBFF'"
    [style.font-size.px]="size() * 0.42" aria-hidden="true">{{ initials() }}</span>`,
  styles: [`.av { display: inline-grid; place-items: center; border-radius: 50%; font-weight: 700; color: #24406f; flex: 0 0 auto; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(28,39,64,.12); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChildAvatarComponent {
  readonly child = input<Child | null>(null);
  readonly size = input(40);
  readonly initials = computed(() => (this.child()?.first_name ?? '?').slice(0, 1).toUpperCase());
}

/** Status shown with icon + text, never colour alone. */
@Component({
  selector: 'app-status-badge',
  imports: [IconComponent],
  template: `<span class="badge" [class]="'badge ' + tone()"><app-icon [name]="icon()" [size]="14" [stroke]="2.4" />{{ label() || text() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<InjectionStatus>();
  readonly label = input<string>('');
  readonly text = computed(() => STATUS_LABEL[this.status()]);
  readonly tone = computed(() => ({ given: 'success', skipped: 'warning', missed: 'danger', pending: 'info' })[this.status()]);
  readonly icon = computed(() => ({ given: 'check', skipped: 'x', missed: 'alert', pending: 'clock' })[this.status()]);
}

@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  template: `
    <div class="empty" role="status">
      @if (image()) { <img [src]="image()" alt="" width="140" height="100" /> }
      @else { <div class="icon-tile"><app-icon [name]="icon()" [size]="26" /></div> }
      <h3>{{ title() }}</h3>
      @if (text()) { <p class="muted">{{ text() }}</p> }
      <ng-content />
    </div>`,
  styles: [`
    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 28px 16px; }
    .empty img { width: 140px; height: auto; mix-blend-mode: multiply; }
    .empty .icon-tile { width: 56px; height: 56px; border-radius: 18px; }
    .empty p { max-width: 320px; font-size: 14px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly text = input<string>('');
  readonly icon = input('info');
  readonly image = input<string | null>(null);
}

@Component({
  selector: 'app-loading',
  template: `
    <div class="sk" aria-busy="true" aria-live="polite">
      <span class="sr-only">Učitavanje…</span>
      @for (r of rowsArr(); track $index) { <div class="skeleton" [style.height.px]="height()"></div> }
    </div>`,
  styles: [`.sk { display: flex; flex-direction: column; gap: 12px; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSkeletonComponent {
  readonly rows = input(3);
  readonly height = input(72);
  readonly rowsArr = computed(() => Array.from({ length: this.rows() }));
}

@Component({
  selector: 'app-error-state',
  imports: [IconComponent],
  template: `
    <div class="err" role="alert">
      <div class="icon-tile" [class.warning]="kind() === 'offline'" [class.danger]="kind() !== 'offline'">
        <app-icon [name]="kind() === 'offline' ? 'wifi-off' : kind() === 'permission' ? 'shield' : 'alert'" />
      </div>
      <div class="grow">
        <h4>{{ title() }}</h4>
        <p class="muted small">{{ message() }}</p>
      </div>
      @if (retryable()) { <button class="btn sm outline" type="button" (click)="retry.emit()">Pokušaj ponovo</button> }
    </div>`,
  styles: [`.err { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 16px; background: var(--card); border: 1px solid var(--border); }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  readonly message = input('Došlo je do greške.');
  readonly kind = input<'error' | 'offline' | 'permission'>('error');
  readonly retryable = input(true);
  readonly retry = output<void>();
  readonly title = computed(() => ({ error: 'Nešto nije u redu', offline: 'Niste povezani', permission: 'Nemate pristup' })[this.kind()]);
}

/** Page header with optional back button and trailing actions. */
@Component({
  selector: 'app-page-header',
  imports: [IconComponent, RouterLink],
  template: `
    <header class="ph">
      @if (back()) {
        @if (backLink()) {
          <a class="icon-btn" [routerLink]="backLink()" aria-label="Nazad"><app-icon name="back" /></a>
        } @else {
          <button class="icon-btn" type="button" (click)="location.back()" aria-label="Nazad"><app-icon name="back" /></button>
        }
      }
      <div class="grow">
        <h1>{{ title() }}</h1>
        @if (subtitle()) { <p class="muted small">{{ subtitle() }}</p> }
      </div>
      <ng-content />
    </header>`,
  styles: [`
    .ph { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; min-height: 40px; }
    .ph h1 { font-size: 21px; }
    @media (min-width: 1024px) { .ph h1 { font-size: 26px; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  readonly location = inject(Location);
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly back = input(false);
  readonly backLink = input<string | null>(null);
}

@Component({
  selector: 'app-metric-card',
  imports: [IconComponent],
  template: `
    <div class="mc">
      <div class="row top between">
        <span class="label">{{ label() }}</span>
        @if (icon()) { <span class="icon-tile sm" [class]="'icon-tile sm ' + tone()"><app-icon [name]="icon()" [size]="16" /></span> }
      </div>
      <div class="value num">{{ value() || '—' }}</div>
      @if (hint()) { <div class="hint" [class.up]="trend() === 'up'">{{ hint() }}</div> }
    </div>`,
  styles: [`
    .mc { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .label { font-size: 13px; color: var(--text-2); font-weight: 600; }
    .value { font-size: clamp(15px, 4.6vw, 20px); font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hint { font-size: 12px; color: var(--text-3); }
    .hint.up { color: var(--success); font-weight: 600; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input<string>('');
  readonly hint = input<string>('');
  readonly icon = input<string>('');
  readonly tone = input<string>('');
  readonly trend = input<'up' | 'none'>('none');
}
