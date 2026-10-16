import { AppEnvironment } from './environment.model';

/**
 * Copy to environment.ts / environment.development.ts and fill in.
 * ONLY public client values belong here. Never put the service-role key,
 * OCR provider keys or VAPID private keys in the Angular app.
 */
export const environment: AppEnvironment = {
  production: false,
  backend: 'supabase', // 'local' = demo mode on IndexedDB, 'supabase' = real backend
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-PUBLIC-ANON-KEY',
  ocrProvider: 'edge', // 'browser' (on-device Tesseract), 'edge' (Supabase Edge Function), 'mock'
  vapidPublicKey: '', // Web Push public key (optional)
};
