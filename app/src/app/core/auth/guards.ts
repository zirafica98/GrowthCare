import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FamilyService } from '../services/family.service';
import { AuthService } from './auth.service';

// Note: all inject() calls happen before the first await (injection context).

/** Protects /app: requires a session and a family. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const family = inject(FamilyService);
  await auth.init();
  if (!auth.user()) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  await family.ensureLoaded();
  if (!family.current()) return router.createUrlTree(['/setup']);
  return true;
};

/** /setup requires a session. */
export const sessionGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.user() ? true : router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Login/register pages redirect away when already signed in. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.user() ? router.createUrlTree(['/app']) : true;
};
