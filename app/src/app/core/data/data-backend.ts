import { TableName } from '../models/models';
import { Query } from './query';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
}

/**
 * Persistence port. Feature services only talk to this abstraction, never to
 * Supabase directly, so the app can run against:
 *  - SupabaseBackend (production; authorisation enforced by Postgres RLS)
 *  - LocalBackend    (demo/offline development; RLS emulated in-process)
 *
 * Contract:
 *  - `insert` is idempotent on `id` (client-generated UUID). Replaying the
 *    same insert must never create a duplicate row.
 *  - Errors are thrown as AppError (see errors.ts).
 */
export abstract class DataBackend {
  abstract readonly kind: 'local' | 'supabase';

  abstract list<T>(table: TableName, query?: Partial<Query>): Promise<T[]>;
  abstract get<T>(table: TableName, id: string): Promise<T | null>;
  abstract insert<T extends { id: string }>(table: TableName, row: T): Promise<T>;
  abstract update<T>(table: TableName, id: string, patch: Partial<T>): Promise<T>;
  abstract remove(table: TableName, id: string): Promise<void>;
  abstract rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;

  /** Private storage. Paths: {family_id}/{child_id}/{document_id}/{filename}. */
  abstract upload(path: string, file: Blob, contentType: string): Promise<void>;
  /** Short-lived URL; never a permanent public URL. */
  abstract signedUrl(path: string, expiresInSeconds: number): Promise<string>;
  abstract download(path: string): Promise<Blob>;
  abstract removeFile(path: string): Promise<void>;
}

export abstract class AuthBackend {
  abstract restore(): Promise<AuthUser | null>;
  abstract signIn(email: string, password: string): Promise<AuthUser>;
  abstract signUp(email: string, password: string, fullName: string): Promise<{ user: AuthUser | null; needsConfirmation: boolean }>;
  abstract signOut(): Promise<void>;
  abstract resetPassword(email: string): Promise<void>;
  abstract updatePassword(password: string): Promise<void>;
  /** OAuth sign-in (redirects away). `next` is the in-app path to return to. */
  abstract signInWithGoogle(next: string): Promise<void>;
  readonly supportsOAuth: boolean = false;
  abstract onChange(cb: (user: AuthUser | null) => void): void;
}
