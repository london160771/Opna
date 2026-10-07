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
      port: 3001,
      corsOrigins: ['http://localhost:5173', 'https://app.example.com'],
    });
  });

  it('reports missing variables without printing their values', () => {
    expect(() => loadConfig({})).toThrow('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CORS_ORIGINS');
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
