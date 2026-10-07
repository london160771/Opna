import type { Request, Response, Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnerLocals } from './auth/requireOwner.js';

type BookingStatus = 'confirmed' | 'completed' | 'cancelled';
type BookingRow = {
  id: string;
  business_id: string;
  service_id: string;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
  customer_name: string;
  customer_email?: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
};
type Cursor = { startsAt: string; id: string };

const bookingFields = 'id, business_id, service_id, service_name_snapshot, duration_minutes_snapshot, customer_name, customer_email, starts_at, ends_at, status, created_at, updated_at';
const bookingListFields = 'id, business_id, service_id, service_name_snapshot, duration_minutes_snapshot, customer_name, starts_at, ends_at, status, created_at, updated_at';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageSize = 50;

function ownerClient(res: Response): SupabaseClient {
  return (res.locals as OwnerLocals).owner.supabase;
}

function sendError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

async function getBusiness(client: SupabaseClient) {
  return client.from('businesses').select('id, timezone').maybeSingle();
}

function presentBooking(booking: BookingRow, timezone: string, includeContact = false) {
  return {
    id: booking.id,
    businessId: booking.business_id,
    serviceId: booking.service_id,
    serviceName: booking.service_name_snapshot,
    durationMinutes: booking.duration_minutes_snapshot,
    customerName: booking.customer_name,
    ...(includeContact && booking.customer_email ? { customerEmail: booking.customer_email } : {}),
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    status: booking.status,
    timezone,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
  };
}

function encodeCursor(row: Pick<BookingRow, 'starts_at' | 'id'>) {
  return Buffer.from(JSON.stringify({ startsAt: row.starts_at, id: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(value: unknown): Cursor | null | false {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof decoded.startsAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(decoded.startsAt)
      || !Number.isFinite(Date.parse(decoded.startsAt))) return false;
    if (typeof decoded.id !== 'string' || !uuidPattern.test(decoded.id)) return false;
    return { startsAt: decoded.startsAt, id: decoded.id };
  } catch {
    return false;
  }
}

function registerDashboardRoute(router: Router) {
  router.get('/dashboard', async (_req: Request, res: Response) => {
    const client = ownerClient(res);
    const { data: business, error: businessError } = await getBusiness(client);
    if (businessError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load your dashboard. Try again.');
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');

    const now = new Date();
    const countStatus = (status: Exclude<BookingStatus, 'confirmed'> | 'confirmed', upcoming = false) => {
      let query = client.from('bookings').select('id', { count: 'exact', head: true })
        .eq('business_id', business.id).eq('status', status);
      if (upcoming) query = query.gt('starts_at', now.toISOString());
      return query;
    };

    const [upcomingResult, completedResult, cancelledResult, nextResult] = await Promise.all([
      countStatus('confirmed', true),
      countStatus('completed'),
      countStatus('cancelled'),
      client.from('bookings').select(bookingListFields)
        .eq('business_id', business.id).eq('status', 'confirmed')
        .gt('starts_at', now.toISOString()).order('starts_at', { ascending: true })
        .order('id', { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (upcomingResult.error || completedResult.error || cancelledResult.error || nextResult.error) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load your dashboard. Try again.');
    }

    const nextBooking = nextResult.data as BookingRow | null;
    return res.json({ data: {
      counts: {
        upcoming: upcomingResult.count ?? 0,
        completed: completedResult.count ?? 0,
        cancelled: cancelledResult.count ?? 0,
      },
      nextBooking: nextBooking ? presentBooking(nextBooking, business.timezone) : null,
    } });
  });
}

function registerBookingListRoute(router: Router) {
  router.get('/bookings', async (req: Request, res: Response) => {
    const cursor = decodeCursor(req.query.cursor);
    if (cursor === false) return sendError(res, 400, 'INVALID_REQUEST', 'That booking page cursor is invalid. Refresh the list to continue.');

    const client = ownerClient(res);
    const { data: business, error: businessError } = await getBusiness(client);
    if (businessError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load your bookings. Try again.');
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');

    let query = client.from('bookings').select(bookingListFields)
      .eq('business_id', business.id);
    if (cursor) {
      query = query.or(`starts_at.lt.${cursor.startsAt},and(starts_at.eq.${cursor.startsAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await query.order('starts_at', { ascending: false })
      .order('id', { ascending: false }).limit(pageSize);
    if (error) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load your bookings. Try again.');

    const rows = (data ?? []) as BookingRow[];
    const hasMore = rows.length === pageSize;
    const lastRow = rows.at(-1);
    return res.json({ data: {
      bookings: rows.map((booking) => presentBooking(booking, business.timezone)),
      nextCursor: hasMore && lastRow ? encodeCursor(lastRow) : null,
    } });
  });
}

function registerBookingDetailRoute(router: Router) {
  router.get('/bookings/:id', async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!uuidPattern.test(id)) return sendError(res, 400, 'INVALID_REQUEST', 'Use a valid booking ID.');

    const client = ownerClient(res);
    const { data: business, error: businessError } = await getBusiness(client);
    if (businessError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load this booking. Try again.');
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');
    const { data, error } = await client.from('bookings').select(bookingFields)
      .eq('business_id', business.id).eq('id', id).maybeSingle();
    if (error) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load this booking. Try again.');
    if (!data) return sendError(res, 404, 'NOT_FOUND', 'That booking was not found.');
    return res.json({ data: presentBooking(data as BookingRow, business.timezone, true) });
  });
}

function registerBookingStatusRoute(router: Router) {
  router.patch('/bookings/:id/status', async (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!uuidPattern.test(id)) return sendError(res, 400, 'INVALID_REQUEST', 'Use a valid booking ID.');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).length !== 1 || !['completed', 'cancelled'].includes(req.body.status)) {
      return sendError(res, 400, 'INVALID_REQUEST', 'Choose whether to complete or cancel this booking.');
    }
    const target = req.body.status as 'completed' | 'cancelled';
    const client = ownerClient(res);
    const { data: business, error: businessError } = await getBusiness(client);
    if (businessError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not update this booking. Try again.');
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');

    const { data: currentData, error: currentError } = await client.from('bookings').select(bookingFields)
      .eq('business_id', business.id).eq('id', id).maybeSingle();
    if (currentError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not update this booking. Try again.');
    if (!currentData) return sendError(res, 404, 'NOT_FOUND', 'That booking was not found.');
    const current = currentData as BookingRow;
    if (current.status === target) return res.json({ data: presentBooking(current, business.timezone, true) });
    if (current.status !== 'confirmed') {
      return sendError(res, 422, 'INVALID_STATUS_TRANSITION', 'Only confirmed bookings can be changed.');
    }
    if (target === 'completed' && Date.parse(current.ends_at) > Date.now()) {
      return sendError(res, 422, 'BOOKING_NOT_ENDED', 'A booking can be marked complete after its appointment has ended.');
    }

    const { data: updatedData, error: updateError } = await client.from('bookings').update({ status: target })
      .eq('business_id', business.id).eq('id', id).eq('status', 'confirmed')
      .select(bookingFields).maybeSingle();
    if (updateError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not update this booking. Try again.');
    if (updatedData) return res.json({ data: presentBooking(updatedData as BookingRow, business.timezone, true) });

    const { data: latestData, error: latestError } = await client.from('bookings').select(bookingFields)
      .eq('business_id', business.id).eq('id', id).maybeSingle();
    if (latestError) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not verify this booking update. Refresh and try again.');
    if (!latestData) return sendError(res, 404, 'NOT_FOUND', 'That booking was not found.');
    const latest = latestData as BookingRow;
    if (latest.status === target) return res.json({ data: presentBooking(latest, business.timezone, true) });
    return sendError(res, 409, 'BOOKING_STATUS_CHANGED', 'This booking changed in another request. Refresh the page to see its latest status.');
  });
}

export function registerOwnerBookingRoutes(router: Router) {
  registerDashboardRoute(router);
  registerBookingListRoute(router);
  registerBookingDetailRoute(router);
  registerBookingStatusRoute(router);
}
