export interface AppEnvironment {
  production: boolean;
  backend: 'local' | 'supabase';
  supabaseUrl: string;
  supabaseAnonKey: string;
  ocrProvider: 'browser' | 'edge' | 'mock';
  vapidPublicKey: string;
}
