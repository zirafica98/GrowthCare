import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChildService } from '../../core/services/child.service';
import { CenterItem, NotificationService } from '../../core/services/notification.service';
import { relativeDays, toLocalTime } from '../../core/utils/dates';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';

const ICON: Record<CenterItem['kind'], string> = {
  dose: 'syringe', missed_dose: 'alert', appointment: 'stethoscope', laboratory: 'flask', measurement: 'ruler', stock: 'package', custom: 'bell', sync: 'refresh',
};

/** In-app notification centre (works without push permission). */
@Component({
  selector: 'app-notifications-page',
  imports: [RouterLink, PageHeaderComponent, IconComponent, EmptyStateComponent],
  template: `
    <div class="page">
      <app-page-header title="Obaveštenja">
        @if (svc.unreadCount()) { <button class="btn ghost sm" type="button" (click)="svc.markAllRead()">Označi sve kao pročitano</button> }
      </app-page-header>
      @if (svc.permission() !== 'granted' && svc.permission() !== 'unsupported') {
        <div class="notice info" style="margin-bottom:12px"><app-icon name="bell" [size]="18" />
          <span class="grow">Uključite obaveštenja na telefonu da biste dobijali podsetnike.</span>
          <button class="btn sm primary" type="button" (click)="svc.requestPermission()">Uključi</button></div>
      }
      <div class="card" style="padding:4px 12px">
        @for (n of svc.items(); track n.key) {
          <button class="list-item" type="button" (click)="open(n)" [class.unread]="!svc.read().has(n.key)">
            <span class="icon-tile sm" [class.warning]="n.tone === 'warning'" [class.success]="n.tone === 'success'"><app-icon [name]="icon[n.kind]" [size]="16" /></span>
            <span class="grow">
              <b class="small">{{ n.title }}</b>
              <span class="tiny muted" style="display:block">{{ n.body }}</span>
            </span>
            <span class="tiny subtle nowrap">{{ when(n.at) }}</span>
            @if (!svc.read().has(n.key)) { <span class="dot" aria-label="Nepročitano"></span> }
          </button>
        } @empty {
          <app-empty-state title="Nema obaveštenja" text="Ovde stižu podsetnici za doze, kontrole, laboratoriju i zalihe." image="illustrations/e-notify.png" />
        }
      </div>
      <p class="tiny muted" style="margin:10px 4px">Podešavanja obaveštenja i tihi sati su u <a routerLink="/app/settings">Podešavanjima</a>.</p>
    </div>`,
  styles: [`.unread b { color: var(--text); } .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--primary); flex: 0 0 auto; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  readonly svc = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly children = inject(ChildService);
  readonly icon = ICON;

  when(d: Date): string {
    const r = relativeDays(d);
    return r === 'danas' ? toLocalTime(d) : r;
  }

  open(n: CenterItem): void {
    this.svc.markRead(n.key);
    if (n.childId) this.children.select(n.childId); // notifications always open in the right child's context
    if (n.link) void this.router.navigateByUrl(n.link);
  }
}
