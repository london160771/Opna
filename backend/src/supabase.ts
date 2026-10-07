import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from './config.js';

export type UserSupabaseFactory = (accessToken: string) => SupabaseClient;

export function createUserSupabaseFactory(config: AppConfig): UserSupabaseFactory {
  return (accessToken) => createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
