import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LogoComponent } from '../../shared/ui/basics';

/** Shared calm hero layout for login/register/password pages (design: splash screen). */
@Component({
  selector: 'app-auth-shell',
  imports: [LogoComponent],
  template: `
    <div class="auth">
      <div class="hero" aria-hidden="true">
        <img src="illustrations/hero-landscape.png" alt="" />
      </div>
      <div class="panel">
        <div class="brand">
          <app-logo [size]="64" [stacked]="true" />
          <p class="tagline">Praćenje terapije i rasta deteta</p>
        </div>
        <img class="mobile-hero" src="illustrations/hero-landscape.png" alt="" width="310" height="285" />
        <div class="card form-card">
          @if (title()) { <h2>{{ title() }}</h2> }
          <ng-content />
        </div>
        <p class="tiny subtle center foot">GrowthCare beleži podatke koje unesete. Ne daje medicinske savete niti preporučuje doze.</p>
      </div>
    </div>`,
  styles: [`
    .auth { min-height: 100vh; min-height: 100dvh; display: grid; background: linear-gradient(180deg, var(--auth-a) 0%, var(--auth-b) 55%, var(--auth-c) 100%); }
    .hero { display: none; }
    .panel { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: calc(28px + var(--safe-top)) 18px 28px; gap: 18px; }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .tagline { color: var(--text-2); font-weight: 500; }
    .form-card { width: min(420px, 100%); padding: 22px; border-radius: 24px; display: flex; flex-direction: column; gap: 14px; }
    .form-card h2 { font-size: 20px; }
    .foot { max-width: 360px; }
    .mobile-hero { width: min(420px, 100%); height: 170px; object-fit: cover; object-position: 30% 12%; border-radius: 24px; margin-bottom: -40px; box-shadow: var(--shadow); }
    .form-card { position: relative; }
    @media (min-width: 900px) {
      .auth { grid-template-columns: 1.05fr 1fr; }
      .hero { display: block; position: relative; overflow: hidden; }
      .mobile-hero { display: none; }
      .hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 30% 60%; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {
  readonly title = input('');
}
