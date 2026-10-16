import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { FamilyInvitation, FamilyMember } from '../../core/models/models';
import { ChildService } from '../../core/services/child.service';
import { FamilyService } from '../../core/services/family.service';
import { ToastService } from '../../core/services/toast.service';
import { formatAge, formatDate } from '../../core/utils/dates';
import { ChildAvatarComponent, PageHeaderComponent } from '../../shared/ui/basics';
import { ConfirmService } from '../../shared/ui/confirm';
import { IconComponent } from '../../shared/ui/icon.component';
import { SheetComponent } from '../../shared/ui/sheet.component';

const INV_STATUS: Record<string, { l: string; tone: string }> = {
  pending: { l: 'Na čekanju', tone: 'warning' }, accepted: { l: 'Prihvaćeno', tone: 'success' }, revoked: { l: 'Opozvano', tone: '' }, expired: { l: 'Isteklo', tone: '' },
};

@Component({
  selector: 'app-family-page',
  imports: [FormsModule, RouterLink, PageHeaderComponent, IconComponent, ChildAvatarComponent, SheetComponent],
  template: `
    <div class="page">
      <app-page-header [title]="family.current()?.name ?? 'Porodica'" subtitle="Roditelji, deca i pristup">
        <button class="icon-btn" type="button" (click)="renameOpen.set(true)" aria-label="Promeni naziv porodice"><app-icon name="edit" /></button>
      </app-page-header>

      <div class="section-title" style="margin-top:0"><h3>Deca</h3><a routerLink="/app/children/new">+ Dodaj dete</a></div>
      <div class="stack sm">
        @for (c of children.children(); track c.id) {
          <a class="card link row" [routerLink]="['/app/children', c.id]">
            <app-child-avatar [child]="c" [size]="48" />
            <div class="grow"><b>{{ children.displayName(c) }}</b><div class="small muted">{{ age(c.date_of_birth) }}</div></div>
            <app-icon name="chevron-right" [size]="18" />
          </a>
        }
      </div>

      <div class="section-title"><h3>Roditelji</h3></div>
      <div class="card" style="padding:4px 12px">
        @for (m of family.members(); track m.id) {
          <div class="list-item">
            <span class="icon-tile sm"><app-icon name="user" [size]="16" /></span>
            <span class="grow"><b class="small">{{ name(m) }}</b><span class="tiny muted" style="display:block">{{ m.role === 'owner' ? 'Vlasnik porodice' : 'Roditelj' }} · od {{ fmt(m.created_at) }}</span></span>
            @if (m.status === 'revoked') { <span class="badge">Bez pristupa</span> }
            @else if (family.isOwner() && m.user_id !== me()) { <button class="btn sm ghost" type="button" style="color:var(--danger)" (click)="revokeMember(m)">Ukloni</button> }
          </div>
        }
      </div>

      <div class="section-title"><h3>Pozivnice</h3></div>
      <section class="card stack">
        <div class="row">
          <img src="illustrations/f-family.png" alt="" width="64" height="62" style="border-radius:14px" />
          <p class="small muted grow">Pozovite drugog roditelja. Svako koristi svoj nalog, a oboje vidite istu decu i iste doze.</p>
        </div>
        <form class="row" (ngSubmit)="invite()">
          <input class="input" type="email" name="email" [(ngModel)]="email" placeholder="email@primer.com" aria-label="E-mail roditelja" autocomplete="off" />
          <button class="btn primary" type="submit" [disabled]="busy() || !valid()">Pozovi</button>
        </form>
        @if (lastLink()) {
          <div class="notice success"><app-icon name="link" [size]="18" /><span class="grow small">Pošaljite ovaj link (važi 7 dana):</span></div>
          <div class="row"><input class="input" readonly [value]="lastLink()" aria-label="Link pozivnice" /><button class="btn outline" type="button" (click)="copy(lastLink()!)" aria-label="Kopiraj"><app-icon name="copy" [size]="18" /></button>
            @if (canShare) { <button class="btn outline" type="button" (click)="share(lastLink()!)" aria-label="Podeli"><app-icon name="upload" [size]="18" /></button> }</div>
        }
        @for (i of family.invitations(); track i.id) {
          <div class="row small">
            <app-icon name="mail" [size]="16" />
            <span class="grow ellipsis">{{ i.email }}</span>
            <span class="badge" [class]="'badge ' + status(i).tone">{{ status(i).l }}</span>
            @if (status(i).l === 'Na čekanju') {
              <button class="btn sm ghost" type="button" (click)="copy(family.inviteLink(i))" aria-label="Kopiraj link"><app-icon name="copy" [size]="16" /></button>
              <button class="btn sm ghost" type="button" (click)="revoke(i)">Opozovi</button>
            }
          </div>
        }
      </section>

      @if (!family.isOwner()) {
        <button class="btn ghost block" type="button" style="margin-top:16px; color:var(--danger)" (click)="leave()">Napusti porodicu</button>
      }
    </div>

    <app-sheet [open]="renameOpen()" title="Naziv porodice" (closed)="renameOpen.set(false)">
      <div class="stack">
        <input class="input" [(ngModel)]="newName" aria-label="Naziv porodice" maxlength="80" />
        <button class="btn primary block" type="button" (click)="rename()">Sačuvaj</button>
      </div>
    </app-sheet>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyPage implements OnInit {
  readonly family = inject(FamilyService);
  readonly children = inject(ChildService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly busy = signal(false);
  readonly lastLink = signal<string | null>(null);
  readonly renameOpen = signal(false);
  readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  email = '';
  newName = '';
  fmt = formatDate;

  async ngOnInit(): Promise<void> {
    const f = this.family.current();
    this.newName = f?.name ?? '';
    if (f) await this.family.loadFamilyDetails(f.id);
  }

  me(): string | undefined {
    return this.auth.user()?.id;
  }

  name(m: FamilyMember): string {
    const n = this.family.memberName(m.user_id);
    return n === 'Vi' ? `${this.auth.user()?.full_name || 'Vi'} (vi)` : n;
  }

  age(dob: string): string {
    return formatAge(dob);
  }

  valid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  status(i: FamilyInvitation) {
    return INV_STATUS[i.status === 'pending' && new Date(i.expires_at) < new Date() ? 'expired' : i.status];
  }

  async invite(): Promise<void> {
    this.busy.set(true);
    try {
      const inv = await this.family.invite(this.email);
      this.lastLink.set(this.family.inviteLink(inv));
      this.email = '';
      this.toast.success('Pozivnica je kreirana.');
    } catch (e) {
      this.toast.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async copy(text: string): Promise<void> {
    await navigator.clipboard?.writeText(text);
    this.toast.success('Link je kopiran.');
  }

  async share(url: string): Promise<void> {
    await navigator.share?.({ title: 'GrowthCare pozivnica', text: `Pozivam te u porodicu „${this.family.current()?.name}” na GrowthCare.`, url }).catch(() => undefined);
  }

  async revoke(i: FamilyInvitation): Promise<void> {
    try {
      await this.family.revokeInvitation(i);
    } catch (e) {
      this.toast.error(e);
    }
  }

  async revokeMember(m: FamilyMember): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Ukloniti roditelja?', message: `${this.name(m)} više neće imati pristup podacima porodice. Istorija njegovih unosa ostaje.`, danger: true, confirmText: 'Ukloni pristup' });
    if (!ok) return;
    try {
      await this.family.revokeMember(m);
      this.toast.success('Pristup je uklonjen.');
    } catch (e) {
      this.toast.error(e);
    }
  }

  async leave(): Promise<void> {
    const mine = this.family.members().find((m) => m.user_id === this.me());
    if (!mine) return;
    const ok = await this.confirm.ask({ title: 'Napustiti porodicu?', message: 'Izgubićete pristup svim podacima ove porodice. Ponovo možete ući samo uz novu pozivnicu.', danger: true, confirmText: 'Napusti' });
    if (!ok) return;
    try {
      await this.family.revokeMember(mine);
      location.href = '/setup';
    } catch (e) {
      this.toast.error(e);
    }
  }

  async rename(): Promise<void> {
    try {
      await this.family.updateFamily({ name: this.newName.trim() });
      this.renameOpen.set(false);
    } catch (e) {
      this.toast.error(e);
    }
  }
}
