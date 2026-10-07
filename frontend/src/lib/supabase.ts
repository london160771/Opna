import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

export const supabase = supabaseConfig.url && supabaseConfig.publishableKey
  ? createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
