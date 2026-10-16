import { AppEnvironment } from './environment.model';

/**
 * Local development. `backend: 'local'` runs the whole app on IndexedDB with
 * demo data — no server needed. Switch to 'supabase' and fill the URL/anon key
 * (public values only!) to use a real Supabase project.
 */
export const environment: AppEnvironment = {
  production: false,
  backend: 'local',
  supabaseUrl: '',
  supabaseAnonKey: '',
  ocrProvider: 'browser',
  vapidPublicKey: '',
};
