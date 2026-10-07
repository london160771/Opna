export const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || '/api';

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '',
};

export const isSupabaseConfigured = Boolean(
  supabaseConfig.url && supabaseConfig.publishableKey,
);
