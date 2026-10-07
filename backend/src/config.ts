export type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey?: string;
  port: number;
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'CORS_ORIGINS'] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const supabaseUrl = env.SUPABASE_URL!.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('SUPABASE_URL must be a valid http or https URL.');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('SUPABASE_URL must be a valid http or https URL.');
  }

  const port = Number(env.PORT?.trim() || '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const corsOrigins = env.CORS_ORIGINS!.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (corsOrigins.length === 0) throw new Error('CORS_ORIGINS must include at least one origin.');

  return {
    supabaseUrl,
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY!.trim(),
    supabaseSecretKey: env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    port,
    corsOrigins,
  };
}
