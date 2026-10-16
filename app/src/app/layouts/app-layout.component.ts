import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../core/auth/auth.service';
import { isDemoMode } from '../core/data/provide-backend';
import { ChildService } from '../core/services/child.service';
import { FamilyService } from '../core/services/family.service';
import { NotificationService } from '../core/services/notification.service';
import { CenterBuilderService } from '../core/services/center-builder.service';
import { OfflineSyncService } from '../core/sync/offline-sync.service';
import { ToastService } from '../core/services/toast.service';
import { formatAge } from '../core/utils/dates';
import { ChildAvatarComponent, LogoComponent } from '../shared/ui/basics';
import { IconComponent } from '../shared/ui/icon.component';
import { SheetComponent } from '../shared/ui/sheet.component';

interface NavItem { path: string; label: string; icon: string; }

export const PRIMARY_NAV: NavItem[] = [
  { path: '/app/dashboard', label: 'Početna', icon: 'home' },
  { path: '/app/history', label: 'Istorija', icon: 'history' },
  { path: '/app/growth', label: 'Rast', icon: 'growth' },
  { path: '/app/calendar', label: 'Kalendar', icon: 'calendar' },
  { path: '/app/more', label: 'Više', icon: 'more' },
];

export const SECONDARY_NAV: NavItem[] = [
  { path: '/app/therapy', label: 'Terapija', icon: 'syringe' },
  { path: '/app/doctors', label: 'Kontrole', icon: 'stethoscope' },
  { path: '/app/laboratory', label: 'Laboratorija', icon: 'flask' },
  { path: '/app/documents', label: 'Dokumenti', icon: 'folder' },
  { path: '/app/reminders', label: 'Podsetnici', icon: 'bell' },
  { path: '/app/timeline', label: 'Hronologija', icon: 'timeline' },
  { path: '/app/search', label: 'Pretraga', icon: 'search' },
  { path: '/app/family', label: 'Porodica', icon: 'users' },
  { path: '/app/settings', label: 'Podešavanja', icon: 'settings' },
];

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, ChildAvatarComponent, LogoComponent, SheetComponent],
  template: `
    <a class="skip" href="#main">Preskoči na sadržaj</a>
    <div class="shell">
      <!-- Desktop / tablet sidebar -->
      <aside class="sidebar" aria-label="Glavni meni">
        <a routerLink="/app/dashboard" class="brand"><app-logo [size]="34" /></a>
        <nav>
          @for (n of primary; track n.path) {
            @if (n.path !== '/app/more') {
              <a [routerLink]="n.path" routerLinkActive="active" class="side-link"><app-icon [name]="n.icon" [size]="20" />{{ n.label }}</a>
            }
          }
          <div class="side-sep"></div>
          @for (n of secondary; track n.path) {
            <a [routerLink]="n.path" routerLinkActive="active" class="side-link"><app-icon [name]="n.icon" [size]="20" />{{ n.label }}</a>
          }
        </nav>
        @if (demo) { <p class="demo-tag tiny">Demo režim — podaci su samo na ovom uređaju</p> }
      </aside>

      <div class="main-col">
        <header class="topbar">
          <button class="child-switch" type="button" (click)="switcherOpen.set(true)" aria-haspopup="dialog"
            [attr.aria-label]="'Izabrano dete: ' + (childName() || 'nema') + '. Promeni dete'">
            <app-child-avatar [child]="child()" [size]="40" />
            <span class="cs-text">
              <span class="cs-name">{{ childName() || 'Dodajte dete' }}</span>
              @if (child()) { <span class="cs-age">{{ age() }}</span> }
            </span>
            <app-icon name="chevron-down" [size]="18" />
          </button>
          <div class="grow"></div>
          <button class="sync" type="button" [class]="'sync ' + sync.state()" (click)="onSyncClick()"
            [attr.aria-label]="syncLabel()" [title]="syncLabel()">
            <app-icon [name]="syncIcon()" [size]="18" />
            @if (sync.pendingCount()) { <span class="num">{{ sync.pendingCount() }}</span> }
          </button>
          <a class="icon-btn bell" routerLink="/app/notifications" aria-label="Obaveštenja">
            <app-icon name="bell" />
            @if (notifications.unreadCount()) { <span class="dot" aria-hidden="true">{{ notifications.unreadCount() > 9 ? '9+' : notifications.unreadCount() }}</span> }
          </a>
        </header>

        @if (!sync.online()) {
          <div class="offline-bar" role="status"><app-icon name="wifi-off" [size]="16" /> Van mreže — prikazani su poslednji učitani podaci. Unosi se čuvaju i šalju kasnije.</div>
        }

        <main id="main" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    </div>

    <!-- Mobile bottom navigation -->
    <nav class="bottom-nav" aria-label="Glavna navigacija">
      @for (n of primary; track n.path) {
        <a [routerLink]="n.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }" class="bn-item"
          [class.active]="n.path === '/app/more' && moreActive()">
          <app-icon [name]="n.icon" [size]="23" />
          <span>{{ n.label }}</span>
        </a>
      }
    </nav>

    <app-sheet [open]="switcherOpen()" title="Izaberite dete" (closed)="switcherOpen.set(false)">
      <div class="list" role="listbox" aria-label="Deca">
        @for (c of children.children(); track c.id) {
          <button class="list-item" role="option" type="button" [attr.aria-selected]="c.id === child()?.id" (click)="pick(c.id)">
            <app-child-avatar [child]="c" [size]="44" />
            <span class="grow">
              <b>{{ children.displayName(c) }}</b>
              <span class="muted small" style="display:block">{{ ageOf(c.date_of_birth) }}</span>
            </span>
            @if (c.id === child()?.id) { <span class="badge info"><app-icon name="check" [size]="14" /> Izabrano</span> }
          </button>
        }
      </div>
      <a class="btn outline block" style="margin-top:12px" routerLink="/app/children/new" (click)="switcherOpen.set(false)"><app-icon name="plus" [size]="18" /> Dodaj dete</a>
    </app-sheet>
  `,
  styleUrl: './app-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppLayoutComponent {
  readonly primary = PRIMARY_NAV;
  readonly secondary = SECONDARY_NAV;
  readonly demo = isDemoMode;
  readonly children = inject(ChildService);
  readonly family = inject(FamilyService);
  readonly sync = inject(OfflineSyncService);
  readonly notifications = inject(NotificationService);
  private readonly center = inject(CenterBuilderService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly switcherOpen = signal(false);
  readonly child = this.children.selected;
  readonly childName = computed(() => this.child()?.first_name ?? '');
  readonly age = computed(() => (this.child() ? formatAge(this.child()!.date_of_birth) : ''));

  private readonly url = toSignal(this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)), { initialValue: null });
  readonly moreActive = computed(() => {
    this.url();
    return SECONDARY_NAV.some((n) => this.router.url.startsWith(n.path)) || this.router.url.startsWith('/app/children') || this.router.url.startsWith('/app/notifications') || this.router.url.startsWith('/app/audit');
  });

  readonly syncIcon = computed(() => ({ synced: 'cloud', pending: 'refresh', syncing: 'refresh', offline: 'wifi-off', error: 'alert' })[this.sync.state()]);
  readonly syncLabel = computed(() => {
    const n = this.sync.pendingCount();
    return {
      synced: 'Sve je sinhronizovano',
      pending: `${n} unos(a) čeka slanje`,
      syncing: 'Sinhronizacija u toku…',
      offline: n ? `Van mreže — ${n} unos(a) čeka slanje` : 'Van mreže',
      error: 'Sinhronizacija nije uspela — pokušaćemo ponovo',
    }[this.sync.state()];
  });

  constructor() {
    // Rebuild the notification centre + local schedule when the family/children change or a sync completes.
    effect(() => {
      const list = this.children.children();
      untracked(() => void this.center.refresh(list));
    });
    this.sync.afterFlush(() => void this.center.refresh(this.children.children()));
    // Surface sync conflicts (e.g. the other parent recorded the same dose).
    effect(() => {
      const problems = this.sync.problems();
      untracked(() => {
        for (const p of problems) {
          this.toast.warning(p.error.kind === 'conflict' ? 'Doza je u međuvremenu već zabeležena na drugom telefonu. Vaš unos nije duplikovan.' : p.error.message);
          this.sync.dismissProblem(p);
        }
      });
    });
    void this.auth;
  }

  ageOf(dob: string): string {
    return formatAge(dob);
  }

  pick(id: string): void {
    this.children.select(id);
    this.switcherOpen.set(false);
    const c = this.children.selected();
    if (c) this.toast.info(`Prikazani su podaci za: ${c.first_name}`);
  }

  onSyncClick(): void {
    if (this.sync.pendingCount()) void this.sync.flush();
    this.toast.info(this.syncLabel());
  }
}
