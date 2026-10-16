import { AppEnvironment } from './environment.model';

/**
 * Local development against the real Supabase project (`npm run start:supabase`).
 * The anon key is a PUBLIC client key — data is protected by Postgres RLS.
 * Never put the service_role key here.
 */
export const environment: AppEnvironment = {
  production: false,
  backend: 'supabase',
  supabaseUrl: 'https://gdqgskrlmxczrjppfoko.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkcWdza3JsbXhjenJqcHBmb2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxODMwNzQsImV4cCI6MjEwNzc1OTA3NH0.JoFvjaRQst_h5GXDxmuYkRGDt_7Fudn9K7hii5_mxKU',
  ocrProvider: 'browser',
  vapidPublicKey: '',
};
