import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { AuthBackend, DataBackend } from './data-backend';
import { LocalAuthBackend } from './local/local-auth';
import { LocalBackend } from './local/local-backend';
import { LocalDb } from './local/local-db';
import { SupabaseAuthBackend, SupabaseBackend } from './supabase/supabase-backend';

export const isDemoMode = environment.backend === 'local';

/** Wires DataBackend/AuthBackend to either Supabase or the on-device demo backend. */
export function provideBackend(): EnvironmentProviders {
  if (environment.backend === 'supabase') {
    const client = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return makeEnvironmentProviders([
      { provide: SupabaseClient, useValue: client },
      { provide: DataBackend, useFactory: () => new SupabaseBackend(client) },
      { provide: AuthBackend, useFactory: () => new SupabaseAuthBackend(client) },
    ]);
  }
  const db = LocalDb.shared();
  return makeEnvironmentProviders([
    { provide: LocalDb, useValue: db },
    { provide: LocalAuthBackend, useFactory: () => new LocalAuthBackend(db) },
    { provide: AuthBackend, useExisting: LocalAuthBackend },
    { provide: DataBackend, useFactory: () => new LocalBackend(db) },
  ]);
}
