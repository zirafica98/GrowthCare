import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { ThemeService } from './core/services/theme.service';
import { seedDemo } from './core/data/local/demo-seed';
import { LocalAuthBackend } from './core/data/local/local-auth';
import { LocalDb } from './core/data/local/local-db';
import { isDemoMode, provideBackend } from './core/data/provide-backend';
import { OCR_PROVIDER } from './core/ocr/ocr-provider';
import { BrowserOcrProvider, EdgeOcrProvider, MockOcrProvider } from './core/ocr/providers';

function ocrProviderFactory() {
  switch (environment.ocrProvider) {
    case 'edge':
      return new EdgeOcrProvider(inject(SupabaseClient));
    case 'mock':
      return new MockOcrProvider();
    default:
      return new BrowserOcrProvider();
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideBackend(),
    { provide: OCR_PROVIDER, useFactory: ocrProviderFactory },
    provideAppInitializer(() => {
      inject(ThemeService);
      const auth = inject(AuthService);
      const seed = isDemoMode ? seedDemo(inject(LocalDb), inject(LocalAuthBackend)) : Promise.resolve();
      return seed.then(() => auth.init());
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
