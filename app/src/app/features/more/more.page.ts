import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ChildService } from '../../core/services/child.service';
import { PageHeaderComponent } from '../../shared/ui/basics';
import { IconComponent } from '../../shared/ui/icon.component';

const TILES = [
  { path: '/app/therapy', label: 'Terapija', hint: 'Lek, doza, zalihe', icon: 'syringe', tile: '' },
  { path: '/app/doctors', label: 'Kontrole', hint: 'Pregledi i lekari', icon: 'stethoscope', tile: 'violet' },
  { path: '/app/laboratory', label: 'Laboratorija', hint: 'Rezultati i grafici', icon: 'flask', tile: 'warning' },
  { path: '/app/documents', label: 'Dokumenti', hint: 'Nalazi, OCR', icon: 'folder', tile: 'pink' },
  { path: '/app/reminders', label: 'Podsetnici', hint: 'Doze, kontrole', icon: 'bell', tile: 'success' },
  { path: '/app/timeline', label: 'Hronologija', hint: 'Sve na jednom mestu', icon: 'timeline', tile: '' },
  { path: '/app/search', label: 'Pretraga', hint: 'Dokumenti, nalazi…', icon: 'search', tile: '' },
  { path: '/app/family', label: 'Porodica', hint: 'Roditelji i deca', icon: 'users', tile: 'violet' },
  { path: '/app/notifications', label: 'Obaveštenja', hint: 'Centar obaveštenja', icon: 'bell', tile: 'warning' },
  { path: '/app/settings', label: 'Podešavanja', hint: 'Nalog, privatnost', icon: 'settings', tile: '' },
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
            <span class="icon-tile" [class]="'icon-tile ' + t.tile"><app-icon [name]="t.icon" /></span>
            <b>{{ t.label }}</b><span class="tiny muted">{{ t.hint }}</span>
          </a>
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
    .tile { display: flex; flex-direction: column; gap: 6px; text-decoration: none !important; color: inherit; }
    @media (min-width: 720px) { .tiles { grid-template-columns: repeat(3, 1fr); } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MorePage {
  readonly children = inject(ChildService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly tiles = TILES;

  async logout(): Promise<void> {
    if (this.auth.pendingWrites() && !confirm('Neki unosi još nisu poslati na server i biće izgubljeni. Odjaviti se?')) return;
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
