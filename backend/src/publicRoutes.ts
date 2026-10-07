import type { Request, Response, Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Temporal } from '@js-temporal/polyfill';
import { BookingRuleError, generateBookingSlots, getBookingDateRange, resolveBookableSlot, validateBookableDate, type BookingWindow } from './bookingRules.js';
import type { PublicSupabaseFactory } from './supabase.js';

type ServiceRow = { id: string; name: string; duration_minutes: number };
type AvailabilityRow = { weekday: number; start_local: string; end_local: string };
type BookingRow = { starts_at: string; ends_at: string };
type Fields = Record<string, string>;

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sendError(res: Response, status: number, code: string, message: string, fields?: Fields) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

function databaseUnavailable(res: Response) {
  return sendError(res, 503, 'PUBLIC_API_NOT_CONFIGURED', 'Public booking is not configured yet.');
}

function databaseFailure(res: Response, error: { code?: string }) {
  if (error.code === '23P01') {
    return sendError(res, 409, 'SLOT_UNAVAILABLE', 'That time is no longer available. Choose another time.');
  }
  return sendError(res, 500, 'INTERNAL_ERROR', 'We could not complete that request. Try again.');
}

function recordBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function pathParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function mapAvailability(rows: AvailabilityRow[]): BookingWindow[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    startLocal: row.start_local.slice(0, 5),
    endLocal: row.end_local.slice(0, 5),
  }));
}

async function getBusiness(client: SupabaseClient, slug: string) {
  return client.from('businesses')
    .select('id, name, slug, timezone')
    .eq('slug', slug)
    .maybeSingle();
}

async function getServices(client: SupabaseClient, businessId: string) {
  return client.from('services')
    .select('id, name, duration_minutes')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name', { ascending: true });
}

async function getAvailability(client: SupabaseClient, businessId: string) {
  return client.from('weekly_availability')
    .select('weekday, start_local, end_local')
    .eq('business_id', businessId)
    .order('weekday', { ascending: true });
}

function localDayStart(date: Temporal.PlainDate, timezone: string) {
  return Temporal.ZonedDateTime.from({
    timeZone: timezone,
    year: date.year,
    month: date.month,
    day: date.day,
    hour: 0,
  }, { disambiguation: 'compatible' }).toInstant();
}

async function getOccupied(client: SupabaseClient, businessId: string, date: Temporal.PlainDate, timezone: string) {
  const start = localDayStart(date, timezone);
  const end = localDayStart(date.add({ days: 1 }), timezone);
  return client.from('bookings')
    .select('starts_at, ends_at')
    .eq('business_id', businessId)
    .in('status', ['confirmed', 'completed'])
    .gt('ends_at', start.toString())
    .lt('starts_at', end.toString());
}

function escapedLike(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function registerPublicRoutes(router: Router, getClient: PublicSupabaseFactory, now: () => Date = () => new Date()) {
  router.get('/businesses', async (req: Request, res: Response) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (query.length > 100) return sendError(res, 400, 'INVALID_REQUEST', 'Search text must be 100 characters or fewer.', { query: 'Use 100 characters or fewer.' });
    if (query.length < 2) return res.json({ data: [] });
    const client = getClient();
    if (!client) return databaseUnavailable(res);

    const pattern = `%${escapedLike(query)}%`;
    const [byName, bySlug] = await Promise.all([
      client.from('businesses').select('name, slug').ilike('name', pattern).order('name', { ascending: true }).limit(10),
      client.from('businesses').select('name, slug').ilike('slug', pattern).order('name', { ascending: true }).limit(10),
    ]);
    if (byName.error) return databaseFailure(res, byName.error);
    if (bySlug.error) return databaseFailure(res, bySlug.error);
    const matches = new Map<string, { name: string; slug: string }>();
    for (const business of [...(byName.data ?? []), ...(bySlug.data ?? [])]) {
      matches.set(business.slug, { name: business.name, slug: business.slug });
    }
    const results = [...matches.values()]
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) || left.slug.localeCompare(right.slug))
      .slice(0, 10);
    return res.json({ data: results });
  });

  router.get('/businesses/:slug', async (req: Request, res: Response) => {
    const slug = pathParam(req.params.slug);
    if (!slugPattern.test(slug)) return sendError(res, 404, 'NOT_FOUND', 'That booking page could not be found.');
    const client = getClient();
    if (!client) return databaseUnavailable(res);
    const { data: business, error: businessError } = await getBusiness(client, slug);
    if (businessError) return databaseFailure(res, businessError);
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'That booking page could not be found.');

    const [serviceResult, availabilityResult] = await Promise.all([
      getServices(client, business.id),
      getAvailability(client, business.id),
    ]);
    if (serviceResult.error) return databaseFailure(res, serviceResult.error);
    if (availabilityResult.error) return databaseFailure(res, availabilityResult.error);
    let bookingWindow;
    try {
      bookingWindow = getBookingDateRange(business.timezone, now());
    } catch {
      return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load this booking page.');
    }
    const services = (serviceResult.data ?? []) as ServiceRow[];
    const availability = (availabilityResult.data ?? []) as AvailabilityRow[];
    return res.json({ data: {
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      services: services.map((service) => ({ id: service.id, name: service.name, durationMinutes: service.duration_minutes })),
      bookingWindow,
      isBookable: services.length > 0 && availability.length > 0,
    } });
  });

  router.get('/businesses/:slug/slots', async (req: Request, res: Response) => {
    const slug = pathParam(req.params.slug);
    const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!slugPattern.test(slug)) return sendError(res, 404, 'NOT_FOUND', 'That booking page could not be found.');
    if (!uuidPattern.test(serviceId)) return sendError(res, 400, 'INVALID_REQUEST', 'Choose a service.', { serviceId: 'Choose a service.' });
    const client = getClient();
    if (!client) return databaseUnavailable(res);
    const { data: business, error: businessError } = await getBusiness(client, slug);
    if (businessError) return databaseFailure(res, businessError);
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'That booking page could not be found.');

    let selectedDate: Temporal.PlainDate;
    try {
      selectedDate = validateBookableDate(date, business.timezone, now());
    } catch (error) {
      if (error instanceof BookingRuleError) return sendError(res, error.status, error.code, error.message);
      return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load available times.');
    }

    const weekday = selectedDate.dayOfWeek % 7;
    const [serviceResult, availabilityResult, occupiedResult] = await Promise.all([
      client.from('services').select('id, name, duration_minutes').eq('id', serviceId).eq('business_id', business.id).eq('is_active', true).maybeSingle(),
      client.from('weekly_availability').select('weekday, start_local, end_local').eq('business_id', business.id).eq('weekday', weekday).maybeSingle(),
      getOccupied(client, business.id, selectedDate, business.timezone),
    ]);
    if (serviceResult.error) return databaseFailure(res, serviceResult.error);
    if (availabilityResult.error) return databaseFailure(res, availabilityResult.error);
    if (occupiedResult.error) return databaseFailure(res, occupiedResult.error);
    if (!serviceResult.data) return sendError(res, 404, 'NOT_FOUND', 'That service is not available.');

    let slots;
    try {
      const availability = availabilityResult.data ? mapAvailability([availabilityResult.data as AvailabilityRow]) : [];
      const occupied = (occupiedResult.data ?? []) as BookingRow[];
      slots = generateBookingSlots({
        date,
        timezone: business.timezone,
        durationMinutes: (serviceResult.data as ServiceRow).duration_minutes,
        availability,
        occupied: occupied.map((booking) => ({ startsAt: booking.starts_at, endsAt: booking.ends_at })),
        now: now(),
      });
    } catch (error) {
      if (error instanceof BookingRuleError) return sendError(res, error.status, error.code, error.message);
      return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load available times.');
    }
    return res.json({ data: { timezone: business.timezone, date, slots } });
  });

  router.post('/businesses/:slug/bookings', async (req: Request, res: Response) => {
    const slug = pathParam(req.params.slug);
    if (!slugPattern.test(slug)) return sendError(res, 404, 'NOT_FOUND', 'That booking page could not be found.');
    const body = recordBody(req.body);
    if (!body) return sendError(res, 400, 'INVALID_REQUEST', 'Send a JSON object to book an appointment.');
    const allowed = ['serviceId', 'startsAt', 'customerName', 'customerEmail'];
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length) return sendError(res, 400, 'INVALID_REQUEST', 'The request contains unsupported fields.', Object.fromEntries(unknown.map((key) => [key, 'This field is not allowed.'])));
    const fields: Fields = {};
    if (typeof body.serviceId !== 'string' || !uuidPattern.test(body.serviceId)) fields.serviceId = 'Choose a service.';
    if (typeof body.startsAt !== 'string') fields.startsAt = 'Choose an available time.';
    if (typeof body.customerName !== 'string' || !body.customerName.trim()) fields.customerName = 'Enter your name.';
    else if (body.customerName.trim().length > 120) fields.customerName = 'Use 120 characters or fewer.';
    if (typeof body.customerEmail !== 'string' || !body.customerEmail.trim()) fields.customerEmail = 'Enter your email address.';
    else if (body.customerEmail.trim().length > 254 || !emailPattern.test(body.customerEmail.trim())) fields.customerEmail = 'Enter a valid email address.';
    if (Object.keys(fields).length) return sendError(res, 422, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);

    const client = getClient();
    if (!client) return databaseUnavailable(res);
    const { data: business, error: businessError } = await getBusiness(client, slug);
    if (businessError) return databaseFailure(res, businessError);
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'That booking page could not be found.');
    let requestedDate: Temporal.PlainDate;
    try {
      requestedDate = Temporal.Instant.from(body.startsAt as string)
        .toZonedDateTimeISO(business.timezone)
        .toPlainDate();
      validateBookableDate(requestedDate.toString(), business.timezone, now());
    } catch (error) {
      if (error instanceof BookingRuleError) return sendError(res, error.status, error.code, error.message, { startsAt: error.message });
      return sendError(res, 400, 'INVALID_REQUEST', 'Choose a valid booking time.', { startsAt: 'Choose a valid booking time.' });
    }
    const [serviceResult, availabilityResult, occupiedResult] = await Promise.all([
      client.from('services').select('id, name, duration_minutes').eq('id', body.serviceId as string).eq('business_id', business.id).eq('is_active', true).maybeSingle(),
      getAvailability(client, business.id),
      getOccupied(client, business.id, requestedDate, business.timezone),
    ]);
    if (serviceResult.error) return databaseFailure(res, serviceResult.error);
    if (availabilityResult.error) return databaseFailure(res, availabilityResult.error);
    if (occupiedResult.error) return databaseFailure(res, occupiedResult.error);
    if (!serviceResult.data) return sendError(res, 404, 'NOT_FOUND', 'That service is not available.');

    let slot;
    try {
      slot = resolveBookableSlot({
        startsAt: body.startsAt,
        timezone: business.timezone,
        durationMinutes: (serviceResult.data as ServiceRow).duration_minutes,
        availability: mapAvailability((availabilityResult.data ?? []) as AvailabilityRow[]),
        occupied: ((occupiedResult.data ?? []) as BookingRow[]).map((booking) => ({ startsAt: booking.starts_at, endsAt: booking.ends_at })),
        now: now(),
      });
    } catch (error) {
      if (error instanceof BookingRuleError) return sendError(res, error.status, error.code, error.message);
      return sendError(res, 500, 'INTERNAL_ERROR', 'We could not verify that time. Choose another.');
    }

    const service = serviceResult.data as ServiceRow;
    const { data: booking, error } = await client.from('bookings').insert({
      business_id: business.id,
      service_id: service.id,
      service_name_snapshot: service.name,
      duration_minutes_snapshot: service.duration_minutes,
      customer_name: (body.customerName as string).trim(),
      customer_email: (body.customerEmail as string).trim().toLowerCase(),
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      status: 'confirmed',
    }).select('id, service_name_snapshot, duration_minutes_snapshot, starts_at, ends_at, status').single();
    if (error) return databaseFailure(res, error);
    return res.status(201).json({ data: {
      reference: booking.id,
      businessName: business.name,
      serviceName: booking.service_name_snapshot,
      durationMinutes: booking.duration_minutes_snapshot,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      timezone: business.timezone,
      status: booking.status,
    } });
  });
}
