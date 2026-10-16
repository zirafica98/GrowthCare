import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { TableName } from '../../models/models';
import { AuthBackend, AuthUser, DataBackend } from '../data-backend';
import { appError, toAppError } from '../errors';
import { Query } from '../query';

const BUCKET = 'medical-documents';

/**
 * Production backend. Authorisation is NOT done here — Postgres RLS and
 * storage policies are the source of truth. This class only translates calls.
 */
@Injectable()
export class SupabaseBackend extends DataBackend {
  readonly kind = 'supabase' as const;

  constructor(private readonly sb: SupabaseClient) {
    super();
  }

  async list<T>(table: TableName, query?: Partial<Query>): Promise<T[]> {
    let req = this.sb.from(table).select('*');
    for (const f of query?.filters ?? []) {
      switch (f.op) {
        case 'eq': req = req.eq(f.col, f.value); break;
        case 'neq': req = req.neq(f.col, f.value); break;
        case 'gt': req = req.gt(f.col, f.value); break;
        case 'gte': req = req.gte(f.col, f.value); break;
        case 'lt': req = req.lt(f.col, f.value); break;
        case 'lte': req = req.lte(f.col, f.value); break;
        case 'in': req = req.in(f.col, f.value as unknown[]); break;
      }
    }
    for (const o of query?.order ?? []) req = req.order(o.col, { ascending: o.asc });
    if (query?.limit !== undefined) req = req.limit(query.limit);
    const { data, error } = await req;
    if (error) throw toAppError(error);
    return (data ?? []) as T[];
  }

  async get<T>(table: TableName, id: string): Promise<T | null> {
    const { data, error } = await this.sb.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw toAppError(error);
    return (data as T) ?? null;
  }

  async insert<T extends { id: string }>(table: TableName, row: T): Promise<T> {
    // upsert + ignoreDuplicates on the primary key = idempotent replay.
    const { error } = await this.sb.from(table).upsert(row as object, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw toAppError(error);
    const saved = await this.get<T>(table, row.id);
    if (!saved) throw appError('permission');
    return saved;
  }

  async update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T> {
    const { data, error } = await this.sb.from(table).update(patch as object).eq('id', id).select('*').maybeSingle();
    if (error) throw toAppError(error);
    if (!data) throw appError('not_found');
    return data as T;
  }

  async remove(table: TableName, id: string): Promise<void> {
    const { error } = await this.sb.from(table).delete().eq('id', id);
    if (error) throw toAppError(error);
  }

  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw toAppError(error);
    return data as T;
  }

  async upload(path: string, file: Blob, contentType: string): Promise<void> {
    const { error } = await this.sb.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
    if (error && !/already exists|Duplicate/i.test(error.message)) throw appError('upload', error);
  }

  async signedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw toAppError(error);
    return data.signedUrl;
  }

  async download(path: string): Promise<Blob> {
    const { data, error } = await this.sb.storage.from(BUCKET).download(path);
    if (error || !data) throw toAppError(error);
    return data;
  }

  async removeFile(path: string): Promise<void> {
    const { error } = await this.sb.storage.from(BUCKET).remove([path]);
    if (error) throw toAppError(error);
  }
}

@Injectable()
export class SupabaseAuthBackend extends AuthBackend {
  constructor(private readonly sb: SupabaseClient) {
    super();
  }

  private toUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined): AuthUser | null {
    if (!u) return null;
    return { id: u.id, email: u.email ?? '', full_name: String(u.user_metadata?.['full_name'] ?? '') };
  }

  async restore(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    return this.toUser(data.session?.user);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (/confirm/i.test(error.message)) throw appError('auth', error, 'Potvrdite e-mail adresu pre prijave.');
      throw appError('auth', error, 'Pogrešan e-mail ili lozinka.');
    }
    return this.toUser(data.user)!;
  }

  async signUp(email: string, password: string, fullName: string) {
    const { data, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${location.origin}/login` },
    });
    if (error) throw appError('validation', error, 'Registracija nije uspela. Proverite podatke.');
    return { user: this.toUser(data.user), needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
    if (error) throw toAppError(error);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw toAppError(error);
  }

  onChange(cb: (user: AuthUser | null) => void): void {
    this.sb.auth.onAuthStateChange((_e, session) => cb(this.toUser(session?.user)));
  }
}
