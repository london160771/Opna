import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { Temporal } from '@js-temporal/polyfill';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

if (process.env.RUN_LOCAL_DB_INTEGRATION === 'true') {
  dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
}

const integrationConfig = process.env.RUN_LOCAL_DB_INTEGRATION === 'true'
  ? loadConfig(process.env)
  : null;
const localHostname = integrationConfig ? new URL(integrationConfig.supabaseUrl).hostname : '';
const integrationEnabled = Boolean(
  integrationConfig?.supabaseSecretKey && ['127.0.0.1', 'localhost', '::1'].includes(localHostname),
);

describe.skipIf(!integrationEnabled)('local database booking overlap integration', () => {
  it('allows exactly one of two competing overlapping inserts', async () => {
    const config = integrationConfig!;
    const client = createClient(config.supabaseUrl, config.supabaseSecretKey!, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const email = `phase2-${suffix}@example.test`;
    let ownerId: string | null = null;
    let businessId: string | null = null;

    try {
      const { data: userResult, error: userError } = await client.auth.admin.createUser({
        email,
        password: `${randomUUID()}aA1!`,
        email_confirm: true,
      });
      if (userError || !userResult.user) throw userError ?? new Error('Local test owner was not created.');
      ownerId = userResult.user.id;

      const { data: business, error: businessError } = await client.from('businesses').insert({
        owner_id: ownerId,
        name: `Phase 2 Integration ${suffix}`,
        slug: `phase-2-integration-${suffix}`,
        timezone: 'UTC',
      }).select('id').single();
      if (businessError || !business) throw businessError ?? new Error('Local test business was not created.');
      businessId = business.id;

      const { data: service, error: serviceError } = await client.from('services').insert({
        business_id: businessId,
        name: 'Integration appointment',
        duration_minutes: 30,
        is_active: true,
      }).select('id').single();
      if (serviceError || !service) throw serviceError ?? new Error('Local test service was not created.');

      const bookDate = Temporal.Now.plainDateISO('UTC').add({ days: 1 });
      await client.from('weekly_availability').insert({
        business_id: businessId,
        weekday: bookDate.dayOfWeek % 7,
        start_local: '00:00:00',
        end_local: '23:45:00',
      }).throwOnError();

      const startsAt = `${bookDate.toString()}T12:00:00Z`;
      const endsAt = Temporal.Instant.from(startsAt).add({ minutes: 30 }).toString();
      const insert = (customerName: string) => client.from('bookings').insert({
        business_id: businessId,
        service_id: service.id,
        service_name_snapshot: 'Integration appointment',
        duration_minutes_snapshot: 30,
        customer_name: customerName,
        customer_email: `${customerName.toLowerCase()}@example.test`,
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'confirmed',
      }).select('id').single();

      const competitors = await Promise.all([insert('First Customer'), insert('Second Customer')]);
      expect(competitors.filter((result) => !result.error)).toHaveLength(1);
      expect(competitors.filter((result) => result.error?.code === '23P01')).toHaveLength(1);

      const { data: bookings, error: bookingsError } = await client.from('bookings')
        .select('id').eq('business_id', businessId);
      if (bookingsError) throw bookingsError;
      expect(bookings).toHaveLength(1);

      await client.from('bookings').delete().eq('business_id', businessId).throwOnError();
      const app = createApp({ config, createPublicClient: () => client });
      const submitBooking = (customerName: string) => request(app)
        .post(`/api/public/businesses/phase-2-integration-${suffix}/bookings`)
        .send({
          serviceId: service.id,
          startsAt,
          customerName,
          customerEmail: `${customerName.toLowerCase().replaceAll(' ', '.')}@example.test`,
        });
      const responses = await Promise.all([submitBooking('Third Customer'), submitBooking('Fourth Customer')]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const conflict = responses.find((response) => response.status === 409);
      expect(conflict?.body.error.code).toBe('SLOT_UNAVAILABLE');

      const { data: apiBookings, error: apiBookingsError } = await client.from('bookings')
        .select('id').eq('business_id', businessId);
      if (apiBookingsError) throw apiBookingsError;
      expect(apiBookings).toHaveLength(1);
    } finally {
      if (businessId) {
        await client.from('bookings').delete().eq('business_id', businessId);
        await client.from('weekly_availability').delete().eq('business_id', businessId);
        await client.from('services').delete().eq('business_id', businessId);
        await client.from('businesses').delete().eq('id', businessId);
      }
      if (ownerId) await client.auth.admin.deleteUser(ownerId);
    }
  });

  it('cancelling an owner booking releases its time for another booking', async () => {
    const config = integrationConfig!;
    const client = createClient(config.supabaseUrl, config.supabaseSecretKey!, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const ownerClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const email = `phase3-${suffix}@example.test`;
    const password = `${randomUUID()}aA1!`;
    let ownerId: string | null = null;
    let businessId: string | null = null;

    try {
      const { data: userResult, error: userError } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (userError || !userResult.user) throw userError ?? new Error('Local test owner was not created.');
      ownerId = userResult.user.id;

      const { data: sessionResult, error: sessionError } = await ownerClient.auth.signInWithPassword({ email, password });
      if (sessionError || !sessionResult.session) throw sessionError ?? new Error('Local test owner did not receive a session.');

      const { data: business, error: businessError } = await client.from('businesses').insert({
        owner_id: ownerId,
        name: `Phase 3 Integration ${suffix}`,
        slug: `phase-3-integration-${suffix}`,
        timezone: 'UTC',
      }).select('id').single();
      if (businessError || !business) throw businessError ?? new Error('Local test business was not created.');
      businessId = business.id;

      const { data: service, error: serviceError } = await client.from('services').insert({
        business_id: businessId,
        name: 'Integration appointment',
        duration_minutes: 30,
        is_active: true,
      }).select('id').single();
      if (serviceError || !service) throw serviceError ?? new Error('Local test service was not created.');

      const startsAt = `${Temporal.Now.plainDateISO('UTC').add({ days: 1 }).toString()}T12:00:00Z`;
      const endsAt = Temporal.Instant.from(startsAt).add({ minutes: 30 }).toString();
      const { data: booking, error: bookingError } = await client.from('bookings').insert({
        business_id: businessId,
        service_id: service.id,
        service_name_snapshot: 'Integration appointment',
        duration_minutes_snapshot: 30,
        customer_name: 'First Customer',
        customer_email: 'first.customer@example.test',
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'confirmed',
      }).select('id').single();
      if (bookingError || !booking) throw bookingError ?? new Error('Local test booking was not created.');

      const app = createApp({ config });
      const cancellation = await request(app).patch(`/api/owner/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${sessionResult.session.access_token}`)
        .send({ status: 'cancelled' }).expect(200);
      expect(cancellation.body.data.status).toBe('cancelled');

      const { error: replacementError } = await client.from('bookings').insert({
        business_id: businessId,
        service_id: service.id,
        service_name_snapshot: 'Integration appointment',
        duration_minutes_snapshot: 30,
        customer_name: 'Replacement Customer',
        customer_email: 'replacement.customer@example.test',
        starts_at: startsAt,
        ends_at: endsAt,
        status: 'confirmed',
      });
      expect(replacementError).toBeNull();
    } finally {
      await ownerClient.auth.signOut();
      if (businessId) {
        await client.from('bookings').delete().eq('business_id', businessId);
        await client.from('services').delete().eq('business_id', businessId);
        await client.from('businesses').delete().eq('id', businessId);
      }
      if (ownerId) await client.auth.admin.deleteUser(ownerId);
    }
  });
});
