import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';

const config: AppConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'publishable-test-key',
  port: 3001,
  corsOrigins: ['http://localhost:5173'],
};

describe('Phase 0 API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns the health envelope', async () => {
    const app = createApp({ config, createUserClient: vi.fn() });
    await request(app).get('/api/health').expect(200).expect({ data: { status: 'ok' } });
  });

  it('rejects anonymous owner access before creating a Supabase client', async () => {
    const createUserClient = vi.fn();
    const app = createApp({ config, createUserClient });
    await request(app)
      .get('/api/owner/business')
      .expect(401)
      .expect({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to access owner routes.' } });
    expect(createUserClient).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: Object.assign(new Error('invalid'), { status: 401 }),
      }) },
    } as unknown as SupabaseClient;
    const app = createApp({ config, createUserClient: vi.fn(() => supabase) });
    await request(app).get('/api/owner/business').set('Authorization', 'Bearer bad-token').expect(401);
  });

  it('returns a retryable error when the auth service is unavailable', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockRejectedValue(new Error('network unavailable')) },
    } as unknown as SupabaseClient;
    const app = createApp({ config, createUserClient: vi.fn(() => supabase) });
    await request(app)
      .get('/api/owner/business')
      .set('Authorization', 'Bearer owner-a-token')
      .expect(503)
      .expect({ error: { code: 'AUTH_UNAVAILABLE', message: 'We could not verify your session. Try again.' } });
  });

  it('verifies the token and returns a minimal owner business projection', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'business-a', name: 'A Studio', slug: 'a-studio', timezone: 'Europe/London' },
        error: null,
      }),
    };
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null }) },
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient;
    const createUserClient = vi.fn(() => supabase);
    const app = createApp({ config, createUserClient });

    await request(app)
      .get('/api/owner/business')
      .set('Authorization', 'Bearer owner-a-token')
      .expect(200)
      .expect({ data: { id: 'business-a', name: 'A Studio', slug: 'a-studio', timezone: 'Europe/London' } });

    expect(createUserClient).toHaveBeenCalledWith('owner-a-token');
    expect(supabase.auth.getUser).toHaveBeenCalledWith('owner-a-token');
    expect(query.select).toHaveBeenCalledWith('id, name, slug, timezone');
  });
});
