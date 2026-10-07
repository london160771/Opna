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

const business = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', timezone: 'Europe/London' };
const futureBooking = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  business_id: business.id,
  service_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  service_name_snapshot: 'Consultation',
  duration_minutes_snapshot: 30,
  customer_name: 'A Customer',
  customer_email: 'customer@example.test',
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  ends_at: new Date(Date.now() + 86_400_000 + 1_800_000).toISOString(),
  status: 'confirmed',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

type QueryResult = { data: unknown; error: unknown | null; count?: number };

function queryFor(result: QueryResult) {
  const calls: Record<string, unknown[][]> = {};
  const query: Record<string, any> = {};
  for (const name of ['select', 'eq', 'gt', 'order', 'limit', 'or', 'update']) {
    calls[name] = [];
    query[name] = vi.fn((...args: unknown[]) => { calls[name]!.push(args); return query; });
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.single = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  query.calls = calls;
  return query;
}

function ownerApp(results: Record<string, QueryResult[]>) {
  const queries: Record<string, ReturnType<typeof queryFor>[]> = {};
  const offsets: Record<string, number> = {};
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null }) },
    from: vi.fn((table: string) => {
      const index = offsets[table] ?? 0;
      offsets[table] = index + 1;
      const result = results[table]?.[index] ?? { data: null, error: null, count: 0 };
      const query = queryFor(result);
      queries[table] ??= [];
      queries[table]!.push(query);
      return query;
    }),
  } as unknown as SupabaseClient;
  const app = createApp({ config, createUserClient: vi.fn(() => supabase) });
  return { app, queries, supabase };
}

function ok(data: unknown, count?: number): QueryResult {
  return { data, error: null, ...(count === undefined ? {} : { count }) };
}

describe('owner booking routes', () => {
  it('returns upcoming, completed, cancelled counts and the next confirmed booking', async () => {
    const { app, queries } = ownerApp({
      businesses: [ok(business)],
      bookings: [ok(null, 3), ok(null, 2), ok(null, 4), ok(futureBooking)],
    });

    const response = await request(app).get('/api/owner/dashboard')
      .set('Authorization', 'Bearer owner-a-token').expect(200);

    expect(response.body.data.counts).toEqual({ upcoming: 3, completed: 2, cancelled: 4 });
    expect(response.body.data.nextBooking).toMatchObject({
      id: futureBooking.id,
      serviceName: 'Consultation',
      timezone: 'Europe/London',
    });
    expect(response.body.data.nextBooking.customerEmail).toBeUndefined();
    expect(queries.bookings).toHaveLength(4);
    expect(queries.bookings?.[0]?.calls.gt).toHaveLength(1);
    expect(queries.bookings?.[0]?.calls.eq).toContainEqual(['business_id', business.id]);
    expect(queries.bookings?.[0]?.calls.eq).toContainEqual(['status', 'confirmed']);
    expect(queries.bookings?.[1]?.calls.eq).toContainEqual(['status', 'completed']);
    expect(queries.bookings?.[2]?.calls.eq).toContainEqual(['status', 'cancelled']);
  });

  it('returns a business-timezone booking page without contact details in the list', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      ...futureBooking,
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${index.toString().padStart(12, '0')}`,
      starts_at: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
    }));
    const { app, queries } = ownerApp({ businesses: [ok(business)], bookings: [ok(rows)] });

    const response = await request(app).get('/api/owner/bookings')
      .set('Authorization', 'Bearer owner-a-token').expect(200);

    expect(response.body.data.bookings).toHaveLength(50);
    expect(response.body.data.bookings[0]).toMatchObject({
      id: rows[0]!.id,
      serviceName: 'Consultation',
      timezone: 'Europe/London',
    });
    expect(response.body.data.bookings[0].customerEmail).toBeUndefined();
    expect(response.body.data.nextCursor).toEqual(expect.any(String));
    expect(queries.bookings?.[0]?.calls.order).toEqual([
      ['starts_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(queries.bookings?.[0]?.calls.eq).toContainEqual(['business_id', business.id]);
  });

  it('rejects a malformed or cross-owner booking detail safely', async () => {
    const { app } = ownerApp({ businesses: [ok(business)], bookings: [ok(null)] });
    await request(app).get('/api/owner/bookings/not-an-id')
      .set('Authorization', 'Bearer owner-a-token').expect(400);
    await request(app).get('/api/owner/bookings/dddddddd-dddd-4ddd-8ddd-dddddddddddd')
      .set('Authorization', 'Bearer owner-a-token')
      .expect(404)
      .expect({ error: { code: 'NOT_FOUND', message: 'That booking was not found.' } });
  });

  it('rejects malformed booking-list cursors', async () => {
    const { app, supabase } = ownerApp({});
    await request(app).get('/api/owner/bookings?cursor=not-a-cursor')
      .set('Authorization', 'Bearer owner-a-token')
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST', message: 'That booking page cursor is invalid. Refresh the list to continue.' } });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns contact details only from the protected detail endpoint', async () => {
    const { app } = ownerApp({ businesses: [ok(business)], bookings: [ok(futureBooking)] });
    const response = await request(app).get(`/api/owner/bookings/${futureBooking.id}`)
      .set('Authorization', 'Bearer owner-a-token').expect(200);
    expect(response.body.data).toMatchObject({
      customerName: 'A Customer',
      customerEmail: 'customer@example.test',
      timezone: 'Europe/London',
      durationMinutes: 30,
    });
  });

  it('prevents completing a confirmed booking before it ends', async () => {
    const { app, queries } = ownerApp({ businesses: [ok(business)], bookings: [ok(futureBooking)] });
    await request(app).patch(`/api/owner/bookings/${futureBooking.id}/status`)
      .set('Authorization', 'Bearer owner-a-token').send({ status: 'completed' })
      .expect(422)
      .expect({ error: { code: 'BOOKING_NOT_ENDED', message: 'A booking can be marked complete after its appointment has ended.' } });
    expect(queries.bookings).toHaveLength(1);
  });

  it('cancels a confirmed booking with a conditional owner-scoped update', async () => {
    const cancelled = { ...futureBooking, status: 'cancelled' };
    const { app, queries } = ownerApp({
      businesses: [ok(business)],
      bookings: [ok(futureBooking), ok(cancelled)],
    });
    const response = await request(app).patch(`/api/owner/bookings/${futureBooking.id}/status`)
      .set('Authorization', 'Bearer owner-a-token').send({ status: 'cancelled' }).expect(200);

    expect(response.body.data.status).toBe('cancelled');
    expect(response.body.data.customerEmail).toBe('customer@example.test');
    expect(queries.bookings?.[1]?.calls.update).toEqual([[{ status: 'cancelled' }]]);
    expect(queries.bookings?.[1]?.calls.eq).toContainEqual(['business_id', business.id]);
    expect(queries.bookings?.[1]?.calls.eq).toContainEqual(['status', 'confirmed']);
  });

  it('marks an ended confirmed booking complete and treats a repeated action as a no-op', async () => {
    const ended = { ...futureBooking, starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: new Date(Date.now() - 1_800_000).toISOString() };
    const completed = { ...ended, status: 'completed' };
    const first = ownerApp({ businesses: [ok(business)], bookings: [ok(ended), ok(completed)] });
    await request(first.app).patch(`/api/owner/bookings/${ended.id}/status`)
      .set('Authorization', 'Bearer owner-a-token').send({ status: 'completed' })
      .expect(200).expect(({ body }) => expect(body.data.status).toBe('completed'));

    const repeated = ownerApp({ businesses: [ok(business)], bookings: [ok(completed)] });
    await request(repeated.app).patch(`/api/owner/bookings/${ended.id}/status`)
      .set('Authorization', 'Bearer owner-a-token').send({ status: 'completed' })
      .expect(200).expect(({ body }) => expect(body.data.status).toBe('completed'));
    expect(repeated.queries.bookings).toHaveLength(1);
  });

  it('rejects unsupported status changes', async () => {
    const { app } = ownerApp({});
    await request(app).patch(`/api/owner/bookings/${futureBooking.id}/status`)
      .set('Authorization', 'Bearer owner-a-token').send({ status: 'confirmed' })
      .expect(400)
      .expect({ error: { code: 'INVALID_REQUEST', message: 'Choose whether to complete or cancel this booking.' } });
  });

  it('treats an already-cancelled booking as a no-op', async () => {
    const cancelled = { ...futureBooking, status: 'cancelled' };
    const { app, queries } = ownerApp({ businesses: [ok(business)], bookings: [ok(cancelled)] });
    await request(app).patch(`/api/owner/bookings/${futureBooking.id}/status`)
      .set('Authorization', 'Bearer owner-a-token').send({ status: 'cancelled' })
      .expect(200).expect(({ body }) => expect(body.data.status).toBe('cancelled'));
    expect(queries.bookings).toHaveLength(1);
  });
});
