export type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  emailEnabled: boolean;
  supabaseSecretKey?: string;
  resendApiKey?: string;
  emailFrom?: string;
  appUrl?: string;
  keepaliveToken?: string;
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

  const emailEnabledValue = env.EMAIL_ENABLED?.trim().toLowerCase();
  if (emailEnabledValue && emailEnabledValue !== 'true' && emailEnabledValue !== 'false') {
    throw new Error('EMAIL_ENABLED must be true or false.');
  }

  let appUrl: string | undefined;
  if (env.APP_URL?.trim()) {
    try {
      const parsedAppUrl = new URL(env.APP_URL.trim());
      if (!['http:', 'https:'].includes(parsedAppUrl.protocol) || parsedAppUrl.username || parsedAppUrl.password) {
        throw new Error();
      }
      appUrl = parsedAppUrl.origin;
    } catch {
      throw new Error('APP_URL must be a valid http or https URL.');
    }
  }

  return {
    supabaseUrl,
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY!.trim(),
    emailEnabled: emailEnabledValue === 'true',
    supabaseSecretKey: env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    ...(env.RESEND_API_KEY?.trim() ? { resendApiKey: env.RESEND_API_KEY.trim() } : {}),
    ...(env.EMAIL_FROM?.trim() ? { emailFrom: env.EMAIL_FROM.trim() } : {}),
    ...(appUrl ? { appUrl } : {}),
    ...(env.KEEPALIVE_TOKEN?.trim() ? { keepaliveToken: env.KEEPALIVE_TOKEN.trim() } : {}),
    port,
    corsOrigins,
  };
}
