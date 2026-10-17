import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ChildService } from '../../core/services/child.service';
import { PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';

/** Feature illustrations from the design board ("Ilustracije za funkcionalnosti"). */
const TILES = [
  { path: '/app/therapy', label: 'Terapija', hint: 'Lek, doza, zalihe', img: 'f-injection' },
  { path: '/app/doctors', label: 'Kontrole', hint: 'Pregledi i lekari', img: 'f-visit' },
  { path: '/app/laboratory', label: 'Laboratorija', hint: 'Rezultati i grafici', img: 'f-lab' },
  { path: '/app/documents', label: 'Dokumenti', hint: 'Nalazi, OCR', img: 'f-documents' },
  { path: '/app/reminders', label: 'Podsetnici', hint: 'Doze, kontrole', img: 'f-calendar' },
  { path: '/app/timeline', label: 'Hronologija', hint: 'Sve na jednom mestu', img: 'f-charts' },
  { path: '/app/family', label: 'Porodica', hint: 'Roditelji i deca', img: 'f-family' },
];
const LINKS = [
  { path: '/app/search', label: 'Pretraga', icon: 'search' },
  { path: '/app/notifications', label: 'Obaveštenja', icon: 'bell' },
  { path: '/app/settings', label: 'Podešavanja', icon: 'settings' },
];

@Component({
  selector: 'app-more-page',
  imports: [RouterLink, PageHeaderComponent, IconComponent],
  template: `
    <div class="page">
      <app-page-header title="Više" [subtitle]="children.selected()?.first_name ?? ''" />
      <div class="tiles">
        @for (t of tiles; track t.path) {
          <a class="card link tile" [routerLink]="t.path">
            <img [src]="'illustrations/' + t.img + '.png'" alt="" width="148" height="148" />
            <b>{{ t.label }}</b><span class="tiny muted">{{ t.hint }}</span>
          </a>
        }
      </div>
      <div class="card" style="padding:4px 12px; margin-top:12px">
        @for (l of links; track l.path) {
          <a class="list-item" [routerLink]="l.path"><span class="icon-tile sm"><app-icon [name]="l.icon" [size]="16" /></span><span class="grow small strong">{{ l.label }}</span><app-icon name="chevron-right" [size]="16" /></a>
        }
      </div>
      <div class="card soft row" style="margin-top:16px">
        <img src="illustrations/doctor-help.png" alt="" width="64" height="66" style="border-radius:12px; mix-blend-mode:multiply" />
        <p class="small muted grow"><b>Znajte više.</b> GrowthCare vam pomaže da sve zabeležite, ali ne zamenjuje savet lekara. Uvek se konsultujte sa svojim endokrinologom.</p>
      </div>
      <button class="btn outline block" style="margin-top:16px" type="button" (click)="logout()"><app-icon name="logout" [size]="18" /> Odjava</button>
    </div>`,
  styles: [`
    .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .tile { display: flex; flex-direction: column; gap: 2px; text-decoration: none !important; color: inherit; padding: 10px 12px 12px; }
    .tile img { width: 100%; max-width: 132px; height: auto; aspect-ratio: 1; object-fit: contain; align-self: center; border-radius: 18px; margin-bottom: 6px; }
    @media (min-width: 720px) { .tiles { grid-template-columns: repeat(3, 1fr); } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorePage {
  readonly children = inject(ChildService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly tiles = TILES;
  readonly links = LINKS;

  async logout(): Promise<void> {
    if (this.auth.pendingWrites() && !confirm('Neki unosi još nisu poslati na server i biće izgubljeni. Odjaviti se?')) return;
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
