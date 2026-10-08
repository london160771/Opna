import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('loads required values and defaults the API port', () => {
    expect(loadConfig({
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGINS: 'http://localhost:5173, https://app.example.com',
    })).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: 'public-key',
      emailEnabled: false,
      port: 3001,
      corsOrigins: ['http://localhost:5173', 'https://app.example.com'],
    });
  });

  it('reports missing variables without printing their values', () => {
    expect(() => loadConfig({})).toThrow('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CORS_ORIGINS');
  });

  it('loads optional Resend values and normalizes APP_URL to its origin', () => {
    expect(loadConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGINS: 'http://localhost:5173',
      RESEND_API_KEY: 're_test-key',
      EMAIL_FROM: 'Opna <bookings@example.test>',
      APP_URL: 'https://app.example.test/a/path',
      EMAIL_ENABLED: 'true',
    })).toMatchObject({
      emailEnabled: true,
      resendApiKey: 're_test-key',
      emailFrom: 'Opna <bookings@example.test>',
      appUrl: 'https://app.example.test',
    });
  });

  it('keeps email disabled for an explicit false value and rejects invalid values', () => {
    expect(loadConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGINS: 'http://localhost:5173',
      EMAIL_ENABLED: 'false',
    }).emailEnabled).toBe(false);
    expect(() => loadConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGINS: 'http://localhost:5173',
      EMAIL_ENABLED: 'sometimes',
    })).toThrow('EMAIL_ENABLED must be true or false.');
  });

  it('rejects an invalid APP_URL', () => {
    expect(() => loadConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGINS: 'http://localhost:5173',
      APP_URL: 'javascript:alert(1)',
    })).toThrow('APP_URL must be a valid http or https URL.');
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'public-key',
      CORS_ORIGINS: 'http://localhost:5173',
      PORT: '70000',
    })).toThrow('PORT must be an integer');
  });
});
