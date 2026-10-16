import { AppEnvironment } from './environment.model';

/** Production build. Values are injected at build time — see README. */
export const environment: AppEnvironment = {
  production: true,
  backend: 'supabase',
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-PUBLIC-ANON-KEY',
  ocrProvider: 'edge',
  vapidPublicKey: '',
};
