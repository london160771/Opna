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

const ownerBusiness = { id: 'business-a', name: 'A Studio', slug: 'a-studio', timezone: 'Europe/London' };
const service = {
  id: '10000000-0000-4000-8000-000000000001', name: 'Consultation', duration_minutes: 30,
  is_active: true, created_at: '2026-10-07T12:00:00Z', updated_at: '2026-10-07T12:00:00Z',
};

function resultQuery(result: Record<string, unknown>) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'insert', 'update', 'eq', 'order']) {
    query[method] = vi.fn((..._args: unknown[]) => query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.single = vi.fn().mockResolvedValue(result);
  (query as Record<string, unknown>).then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
}

function authenticatedApp(results: Record<string, Record<string, unknown>> = {}, rpcResult: Record<string, unknown> = { data: null, error: null }) {
  const queries: Record<string, ReturnType<typeof resultQuery>> = {};
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null }) },
    from: vi.fn((table: string) => {
      const query = resultQuery(results[table] ?? { data: null, error: null, count: 0 });
      queries[table] = query;
      return query;
    }),
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as unknown as SupabaseClient;
  const createUserClient = vi.fn(() => supabase);
  return { app: createApp({ config, createUserClient }), supabase, queries, createUserClient };
}

describe('Phase 0 API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns the health envelope', async () => {
    const app = createApp({ config, createUserClient: vi.fn() });
    await request(app).get('/api/health').expect(200).expect({ data: { status: 'ok' } });
  });

  it('returns 400 for malformed JSON request bodies', async () => {
    const app = createApp({ config, createUserClient: vi.fn() });
    await request(app).post('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .set('Content-Type', 'application/json').send('{"name":')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST', message: 'Send valid JSON and check the request fields.' } });
  });

  it('returns 400 for malformed JSON request bodies', async () => {
    const app = createApp({ config, createUserClient: vi.fn() });
    await request(app).post('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .set('Content-Type', 'application/json').send('{"name":')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST', message: 'Send valid JSON and check the request fields.' } });
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

  it('loads the owner business with the first-booking timezone lock state', async () => {
    const { app, supabase } = authenticatedApp({
      businesses: { data: ownerBusiness, error: null },
      bookings: { data: null, error: null, count: 2 },
    });

    await request(app).get('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .expect(200)
      .expect({ data: { ...ownerBusiness, hasBookings: true } });

    expect(supabase.auth.getUser).toHaveBeenCalledWith('owner-a-token');
    expect(supabase.from).toHaveBeenCalledWith('businesses');
    expect(supabase.from).toHaveBeenCalledWith('bookings');
  });

  it('creates the owner business using the verified token identity', async () => {
    const inserted = { ...ownerBusiness, id: 'new-business' };
    const { app, queries } = authenticatedApp({ businesses: { data: inserted, error: null } });
    await request(app).post('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .send({ name: ' A Studio ', slug: 'a-studio', timezone: 'Europe/London' })
      .expect(201)
      .expect({ data: { ...inserted, hasBookings: false } });
    expect(queries.businesses?.insert).toHaveBeenCalledWith({ owner_id: 'owner-a', name: 'A Studio', slug: 'a-studio', timezone: 'Europe/London' });
  });

  it('reports a conflicting stable slug without exposing database details', async () => {
    const { app } = authenticatedApp({ businesses: {
      data: null, error: { code: '23505', message: 'duplicate key businesses_slug_key', details: null },
    } });
    await request(app).post('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .send({ name: 'A Studio', slug: 'taken-slug', timezone: 'Europe/London' })
      .expect(409)
      .expect({ error: { code: 'CONFLICT', message: 'That booking link is already taken. Choose another.' } });
  });

  it('does not allow a business slug to be changed', async () => {
    const { app } = authenticatedApp();
    await request(app).patch('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .send({ slug: 'new-slug' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST', message: 'The request contains unsupported fields.', fields: { slug: 'This field is not allowed.' } } });
  });

  it('locks timezone edits after the first booking while allowing profile edits', async () => {
    const { app, queries } = authenticatedApp({
      businesses: { data: ownerBusiness, error: null },
      bookings: { data: null, error: null, count: 1 },
    });
    await request(app).patch('/api/owner/business').set('Authorization', 'Bearer owner-a-token')
      .send({ timezone: 'America/New_York' })
      .expect(422)
      .expect({ error: {
        code: 'TIMEZONE_LOCKED',
        message: 'Your time zone is locked after your first booking to preserve appointment history.',
        fields: { timezone: 'This setting is locked after the first booking.' },
      } });
    expect(queries.businesses?.update).toHaveBeenCalledTimes(0);
  });

  it('validates service duration on the server', async () => {
    const { app, supabase } = authenticatedApp();
    await request(app).post('/api/owner/services').set('Authorization', 'Bearer owner-a-token')
      .send({ name: 'Consultation', durationMinutes: 14 })
      .expect(422)
      .expect({ error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted fields.', fields: { durationMinutes: 'Choose a duration from 15 to 240 minutes in 15-minute intervals.' } } });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns 400 when a service field has the wrong JSON type', async () => {
    const { app, supabase } = authenticatedApp();
    await request(app).post('/api/owner/services').set('Authorization', 'Bearer owner-a-token')
      .send({ name: 123, durationMinutes: '30' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST', message: 'Check the request fields and try again.', fields: { name: 'Enter a text service name.', durationMinutes: 'Enter a number of minutes.' } } });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('lists services in a stable order and returns API field names', async () => {
    const { app } = authenticatedApp({ services: { data: [service], error: null } });
    await request(app).get('/api/owner/services').set('Authorization', 'Bearer owner-a-token')
      .expect(200)
      .expect({ data: [{ id: service.id, name: service.name, durationMinutes: 30, isActive: true, createdAt: service.created_at, updatedAt: service.updated_at }] });
  });

  it('updates a service without deleting it when deactivated', async () => {
    const deactivated = { ...service, is_active: false };
    const { app, queries } = authenticatedApp({ services: { data: deactivated, error: null } });
    await request(app).patch(`/api/owner/services/${service.id}`).set('Authorization', 'Bearer owner-a-token')
      .send({ isActive: false })
      .expect(200)
      .expect({ data: { id: service.id, name: service.name, durationMinutes: 30, isActive: false, createdAt: service.created_at, updatedAt: service.updated_at } });
    expect(queries.services?.update).toHaveBeenCalledWith({ is_active: false });
  });

  it('rejects duplicate weekday windows and overnight windows', async () => {
    const { app, supabase } = authenticatedApp();
    await request(app).put('/api/owner/availability').set('Authorization', 'Bearer owner-a-token')
      .send({ windows: [
        { weekday: 1, startLocal: '09:00', endLocal: '17:00' },
        { weekday: 1, startLocal: '10:00', endLocal: '18:00' },
      ] })
      .expect(422)
      .expect({ error: { code: 'VALIDATION_ERROR', message: 'Check the highlighted opening times.', fields: { 'windows.1.weekday': 'Each weekday can appear only once.' } } });
    await request(app).put('/api/owner/availability').set('Authorization', 'Bearer owner-a-token')
      .send({ windows: [{ weekday: 2, startLocal: '22:00', endLocal: '02:00' }] })
      .expect(422);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('replaces weekly availability and returns the saved windows', async () => {
    const { app, supabase } = authenticatedApp({}, {
      data: [{ weekday: 1, start_local: '09:00:00', end_local: '17:00:00' }], error: null,
    });
    await request(app).put('/api/owner/availability').set('Authorization', 'Bearer owner-a-token')
      .send({ windows: [{ weekday: 1, startLocal: '09:00', endLocal: '17:00' }] })
      .expect(200)
      .expect({ data: { windows: [{ weekday: 1, startLocal: '09:00', endLocal: '17:00' }] } });
    expect(supabase.rpc).toHaveBeenCalledWith('replace_owner_weekly_availability', { p_windows: [{ weekday: 1, startLocal: '09:00', endLocal: '17:00' }] });
  });
});
