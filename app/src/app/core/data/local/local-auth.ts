import { Injectable } from '@angular/core';
import { Profile } from '../../models/models';
import { uuid } from '../../utils/uuid';
import { AuthBackend, AuthUser } from '../data-backend';
import { appError } from '../errors';
import { hashPassword, LocalDb, LocalUserRecord } from './local-db';

/** Device-local auth used in demo mode. Mirrors the Supabase Auth surface. */
@Injectable()
export class LocalAuthBackend extends AuthBackend {
  private listeners: ((u: AuthUser | null) => void)[] = [];

  constructor(private readonly db: LocalDb) {
    super();
  }

  private toUser(u: LocalUserRecord): AuthUser {
    return { id: u.id, email: u.email, full_name: u.full_name };
  }

  private emit(u: AuthUser | null): void {
    this.listeners.forEach((l) => l(u));
  }

  async restore(): Promise<AuthUser | null> {
    await this.db.load();
    const u = this.db.currentUserId ? this.db.user(this.db.currentUserId) : undefined;
    return u ? this.toUser(u) : null;
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    await this.db.load();
    const u = this.db.findUserByEmail(email);
    if (!u || (await hashPassword(password, u.salt)) !== u.password_hash) {
      throw appError('auth', null, 'Pogrešan e-mail ili lozinka.');
    }
    this.db.setSession(u.id);
    const user = this.toUser(u);
    this.emit(user);
    return user;
  }

  async signUp(email: string, password: string, fullName: string): Promise<{ user: AuthUser; needsConfirmation: boolean }> {
    await this.db.load();
    const user = await this.createUser(email, password, fullName);
    this.db.setSession(user.id);
    this.emit(user);
    return { user, needsConfirmation: false };
  }

  /** Also used by the demo seeder. */
  async createUser(email: string, password: string, fullName: string, id = uuid()): Promise<AuthUser> {
    const e = email.trim().toLowerCase();
    if (this.db.findUserByEmail(e)) throw appError('validation', null, 'Nalog sa ovom e-mail adresom već postoji.');
    const salt = uuid();
    const rec: LocalUserRecord = { id, email: e, full_name: fullName, salt, password_hash: await hashPassword(password, salt), created_at: new Date().toISOString() };
    await this.db.saveUser(rec);
    // Equivalent of the handle_new_user() trigger in Postgres.
    const now = new Date().toISOString();
    const profile: Profile = { id, full_name: fullName, avatar_url: null, created_at: now, updated_at: now };
    this.db.table('profiles').set(id, profile as unknown as Record<string, unknown> & { id: string });
    await this.db.persist('profiles');
    return this.toUser(rec);
  }

  async signOut(): Promise<void> {
    this.db.setSession(null);
    this.emit(null);
  }

  async signInWithGoogle(): Promise<void> {
    throw appError('auth', null, 'Google prijava radi samo sa Supabase serverom (ne u demo režimu).');
  }

  async resetPassword(): Promise<void> {
    // Demo mode has no e-mail delivery. The UI explains this.
  }

  async updatePassword(password: string): Promise<void> {
    const u = this.db.currentUserId ? this.db.user(this.db.currentUserId) : undefined;
    if (!u) throw appError('auth');
    const salt = uuid();
    await this.db.saveUser({ ...u, salt, password_hash: await hashPassword(password, salt) });
  }

  onChange(cb: (user: AuthUser | null) => void): void {
    this.listeners.push(cb);
  }
}
