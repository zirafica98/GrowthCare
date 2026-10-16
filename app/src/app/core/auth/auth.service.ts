import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthBackend, AuthUser, DataBackend } from '../data/data-backend';
import { appError } from '../data/errors';
import { OfflineSyncService } from '../sync/offline-sync.service';

export const PASSWORD_RULES = 'Najmanje 8 karaktera, bar jedno slovo i jedan broj.';

export function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Za-zČĆŽŠĐčćžšđ]/.test(pw) && /\d/.test(pw);
}

/** Session state. Everything user-scoped is cleared on logout. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(AuthBackend);
  private readonly backend = inject(DataBackend);
  private readonly sync = inject(OfflineSyncService);

  readonly user = signal<AuthUser | null>(null);
  readonly ready = signal(false);
  readonly isAuthenticated = computed(() => !!this.user());
  private initPromise: Promise<void> | null = null;
  private logoutHooks: (() => void)[] = [];

  init(): Promise<void> {
    return (this.initPromise ??= (async () => {
      this.auth.onChange((u) => this.user.set(u));
      try {
        this.user.set(await this.auth.restore());
      } catch {
        this.user.set(null);
      }
      await this.sync.init(this.backend);
      this.ready.set(true);
    })());
  }

  /** Services register state resets here (child selection, caches…). */
  onLogout(hook: () => void): void {
    this.logoutHooks.push(hook);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const u = await this.auth.signIn(email.trim(), password);
    this.user.set(u);
    void this.sync.flush();
    return u;
  }

  async signUp(email: string, password: string, fullName: string) {
    if (!isStrongPassword(password)) throw appError('validation', null, PASSWORD_RULES);
    const res = await this.auth.signUp(email.trim(), password, fullName.trim());
    if (res.user && !res.needsConfirmation) this.user.set(res.user);
    return res;
  }

  resetPassword(email: string): Promise<void> {
    return this.auth.resetPassword(email.trim());
  }

  updatePassword(password: string): Promise<void> {
    if (!isStrongPassword(password)) throw appError('validation', null, PASSWORD_RULES);
    return this.auth.updatePassword(password);
  }

  /** Pending offline writes are lost on logout; callers should warn first. */
  pendingWrites(): number {
    return this.sync.pendingCount();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.sync.clearAll();
    this.logoutHooks.forEach((h) => h());
    this.user.set(null);
  }
}
