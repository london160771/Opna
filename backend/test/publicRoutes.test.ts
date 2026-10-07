import { describe, expect, it, vi } from 'vitest';
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
const fixedNow = new Date('2026-10-07T07:00:00.000Z');
const businessId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const serviceId = '10000000-0000-4000-8000-000000000001';
const business = { id: businessId, name: 'Northside Studio', slug: 'northside-studio', timezone: 'Europe/London' };
const service = { id: serviceId, name: 'Consultation', duration_minutes: 30, is_active: true };
const availability = [{ weekday: 3, start_local: '09:00:00', end_local: '10:00:00' }];

type Result = { data: unknown; error: { code?: string } | null; count?: number | null };
type FakeResponses = {
  many?: Record<string, Result>;
  maybeSingle?: Record<string, Result>;
  single?: Record<string, Result>;
};

function fakePublicClient(responses: FakeResponses = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const defaults: Result = { data: [], error: null, count: 0 };
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'insert', 'eq', 'ilike', 'order', 'limit', 'in', 'gt', 'lt']) {
        query[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return query;
        };
      }
      query.maybeSingle = () => Promise.resolve(responses.maybeSingle?.[table] ?? defaults);
      query.single = () => Promise.resolve(responses.single?.[table] ?? defaults);
      query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(responses.many?.[table] ?? defaults).then(resolve, reject);
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function appWithPublicClient(fake = fakePublicClient(), extra: { rateLimit?: { limit: number; windowMs: number } } = {}) {
  const app = createApp({
    config,
    createUserClient: vi.fn(),
    createPublicClient: () => fake.client,
    publicRateLimit: extra.rateLimit,
    publicNow: () => fixedNow,
  });
  return { app, fake };
}

describe('public business and booking API', () => {
  it('returns no directory data for queries shorter than two characters', async () => {
    const { app, fake } = appWithPublicClient();
    await request(app).get('/api/public/businesses?query=n').expect(200).expect({ data: [] });
    expect(fake.calls).toHaveLength(0);
  });

  it('bounds search results and exposes only matching business names and slugs', async () => {
    const matches = Array.from({ length: 12 }, (_, index) => ({
      name: `Studio ${String(index + 1).padStart(2, '0')}`,
      slug: `studio-${index + 1}`,
      owner_id: 'must-not-be-exposed',
    }));
    const { app, fake } = appWithPublicClient(fakePublicClient({ many: { businesses: { data: matches, error: null } } }));
    const response = await request(app).get('/api/public/businesses?query=studio').expect(200);
    expect(response.body.data).toHaveLength(10);
    expect(response.body.data[0]).toEqual({ name: 'Studio 01', slug: 'studio-1' });
    expect(response.body.data[0]).not.toHaveProperty('owner_id');
    expect(fake.calls.filter((call) => call.method === 'select').every((call) => call.args[0] === 'name, slug')).toBe(true);
  });

  it('returns public business details and only active service fields', async () => {
    const { app } = appWithPublicClient(fakePublicClient({
      maybeSingle: { businesses: { data: business, error: null } },
      many: {
        services: { data: [service], error: null },
        weekly_availability: { data: availability, error: null },
      },
    }));
    const response = await request(app).get('/api/public/businesses/northside-studio').expect(200);
    expect(response.body.data).toEqual({
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      services: [{ id: service.id, name: service.name, durationMinutes: 30 }],
      bookingWindow: { today: '2026-10-07', lastBookableDate: '2026-11-05' },
      isBookable: true,
    });
    expect(response.body.data).not.toHaveProperty('id');
    expect(response.body.data).not.toHaveProperty('owner_id');
  });

  it('generates available slots in the business time zone', async () => {
    const fake = fakePublicClient({
      maybeSingle: {
        businesses: { data: business, error: null },
        services: { data: service, error: null },
        weekly_availability: { data: availability[0], error: null },
      },
      many: { bookings: { data: [], error: null } },
    });
    const slotApp = appWithPublicClient(fake).app;
    const response = await request(slotApp)
      .get(`/api/public/businesses/northside-studio/slots?serviceId=${serviceId}&date=2026-10-07`)
      .expect(200);
    expect(response.body.data.timezone).toBe('Europe/London');
    expect(response.body.data.slots).toEqual([
      { startsAt: '2026-10-07T08:00:00Z', endsAt: '2026-10-07T08:30:00Z' },
      { startsAt: '2026-10-07T08:15:00Z', endsAt: '2026-10-07T08:45:00Z' },
      { startsAt: '2026-10-07T08:30:00Z', endsAt: '2026-10-07T09:00:00Z' },
    ]);
    expect(fake.calls).toContainEqual({ table: 'bookings', method: 'gt', args: ['ends_at', '2026-10-06T23:00:00Z'] });
    expect(fake.calls).toContainEqual({ table: 'bookings', method: 'lt', args: ['starts_at', '2026-10-07T23:00:00Z'] });
  });

  it('rejects a date outside the 30-local-date range', async () => {
    const { app } = appWithPublicClient(fakePublicClient({ maybeSingle: { businesses: { data: business, error: null } } }));
    await request(app)
      .get(`/api/public/businesses/northside-studio/slots?serviceId=${serviceId}&date=2026-11-06`)
      .expect(422)
      .expect((response) => expect(response.body.error.code).toBe('DATE_OUT_OF_RANGE'));
  });

  it('revalidates inputs and creates a booking with server-derived end and service snapshot', async () => {
    const inserted = {
      id: 'booking-reference', service_name_snapshot: service.name, duration_minutes_snapshot: 30,
      starts_at: '2026-10-07T08:00:00Z', ends_at: '2026-10-07T08:30:00Z', status: 'confirmed',
    };
    const fake = fakePublicClient({
      maybeSingle: {
        businesses: { data: business, error: null },
        services: { data: service, error: null },
      },
      many: {
        weekly_availability: { data: availability, error: null },
        bookings: { data: [], error: null },
      },
      single: { bookings: { data: inserted, error: null } },
    });
    const { app } = appWithPublicClient(fake);
    const response = await request(app).post('/api/public/businesses/northside-studio/bookings').send({
      serviceId,
      startsAt: '2026-10-07T08:00:00Z',
      customerName: '  Taylor Customer  ',
      customerEmail: '  TAYLOR@example.test  ',
    }).expect(201);
    expect(response.body.data).toEqual({
      reference: inserted.id,
      businessName: business.name,
      serviceName: service.name,
      durationMinutes: 30,
      startsAt: inserted.starts_at,
      endsAt: inserted.ends_at,
      timezone: business.timezone,
      status: 'confirmed',
    });
    const insertCall = fake.calls.find((call) => call.table === 'bookings' && call.method === 'insert');
    expect(insertCall?.args[0]).toMatchObject({
      customer_name: 'Taylor Customer', customer_email: 'taylor@example.test',
      service_name_snapshot: 'Consultation', duration_minutes_snapshot: 30,
      starts_at: inserted.starts_at, ends_at: inserted.ends_at, status: 'confirmed',
    });
  });

  it('returns 409 SLOT_UNAVAILABLE for a database overlap race', async () => {
    const fake = fakePublicClient({
      maybeSingle: {
        businesses: { data: business, error: null },
        services: { data: service, error: null },
      },
      many: { weekly_availability: { data: availability, error: null }, bookings: { data: [], error: null } },
      single: { bookings: { data: null, error: { code: '23P01' } } },
    });
    const { app } = appWithPublicClient(fake);
    await request(app).post('/api/public/businesses/northside-studio/bookings').send({
      serviceId, startsAt: '2026-10-07T08:00:00Z', customerName: 'Taylor', customerEmail: 'taylor@example.test',
    }).expect(409).expect({ error: { code: 'SLOT_UNAVAILABLE', message: 'That time is no longer available. Choose another time.' } });
  });

  it('rejects invalid contact input before querying Supabase', async () => {
    const fake = fakePublicClient();
    const { app } = appWithPublicClient(fake);
    await request(app).post('/api/public/businesses/northside-studio/bookings').send({
      serviceId, startsAt: '2026-10-07T08:00:00Z', customerName: 'Taylor', customerEmail: 'invalid',
    }).expect(422).expect((response) => expect(response.body.error.fields.customerEmail).toBeDefined());
    expect(fake.calls).toHaveLength(0);
  });

  it('returns a recoverable configuration error without a backend secret key', async () => {
    const app = createApp({ config, createPublicClient: () => null, createUserClient: vi.fn() });
    await request(app).get('/api/public/businesses/northside-studio').expect(503)
      .expect({ error: { code: 'PUBLIC_API_NOT_CONFIGURED', message: 'Public booking is not configured yet.' } });
  });

  it('rate-limits public requests by client IP', async () => {
    const { app } = appWithPublicClient(fakePublicClient({ many: { businesses: { data: [], error: null } } }), {
      rateLimit: { limit: 1, windowMs: 60_000 },
    });
    await request(app).get('/api/public/businesses?query=studio').expect(200);
    await request(app).get('/api/public/businesses?query=studio').expect(429)
      .expect((response) => expect(response.body.error.code).toBe('RATE_LIMITED'));
  });
});
