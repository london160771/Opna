import type { Router, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OwnerLocals } from './auth/requireOwner.js';
import { registerOwnerBookingRoutes } from './ownerBookingRoutes.js';

type Fields = Record<string, string>;
type Business = { id: string; name: string; slug: string; timezone: string; hasBookings: boolean };
type AvailabilityWindow = { weekday: number; startLocal: string; endLocal: string };

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function ownerClient(res: Response): SupabaseClient {
  return (res.locals as OwnerLocals).owner.supabase;
}

function sendError(res: Response, status: number, code: string, message: string, fields?: Fields) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

function recordBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function rejectUnknownKeys(body: Record<string, unknown>, allowed: string[]): Fields {
  return Object.fromEntries(Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => [key, 'This field is not allowed.']));
}

function validateName(value: unknown, field = 'name'): { value?: string; error?: Fields } {
  if (typeof value !== 'string') return { error: { [field]: 'Enter a name.' } };
  const name = value.trim();
  if (!name) return { error: { [field]: 'Enter a name.' } };
  if (name.length > 120) return { error: { [field]: 'Use 120 characters or fewer.' } };
  return { value: name };
}

function validateTimezone(value: unknown): { value?: string; error?: Fields } {
  if (typeof value !== 'string') return { error: { timezone: 'Choose a time zone.' } };
  const timezone = value.trim();
  if (!timezone || timezone.length > 80) return { error: { timezone: 'Enter a valid IANA time zone.' } };
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return { error: { timezone: 'Enter a valid IANA time zone, such as Europe/London.' } };
  }
  return { value: timezone };
}

function isObjectShapeValid(body: Record<string, unknown>, res: Response, allowed: string[]) {
  const unknown = rejectUnknownKeys(body, allowed);
  if (Object.keys(unknown).length) {
    sendError(res, 400, 'INVALID_REQUEST', 'The request contains unsupported fields.', unknown);
    return false;
  }
  return true;
}

function isMalformed(body: Record<string, unknown>, res: Response, required: string[] = []) {
  const fields: Fields = {};
  for (const key of required) {
    if (!(key in body)) fields[key] = 'This field is required.';
  }
  if (Object.keys(fields).length) {
    sendError(res, 400, 'INVALID_REQUEST', 'Check the request fields and try again.', fields);
    return true;
  }
  return false;
}

function databaseError(res: Response, message: string, error: { code?: string; message?: string; details?: string | null }, conflict?: string) {
  if (error.code === '23514' && error.message?.includes('time zone is locked')) {
    return sendError(res, 422, 'TIMEZONE_LOCKED', 'Your time zone is locked after your first booking to preserve appointment history.', { timezone: 'This setting is locked after the first booking.' });
  }
  if (error.code === '23514' && error.message?.includes('slug cannot be changed')) {
    return sendError(res, 422, 'IMMUTABLE_SLUG', 'A booking link cannot be changed after it is created.', { slug: 'This booking link is permanent.' });
  }
  if (error.code === '23505') {
    const details = `${error.message ?? ''} ${error.details ?? ''}`;
    const code = details.includes('businesses_owner_id_key') ? 'BUSINESS_EXISTS' : 'CONFLICT';
    return sendError(res, 409, code, code === 'BUSINESS_EXISTS' ? 'Your account already has a business.' : (conflict ?? 'That value is already in use.'));
  }
  if (error.code === 'P0002') return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');
  return sendError(res, 500, 'INTERNAL_ERROR', message);
}

async function ownBusiness(supabase: SupabaseClient) {
  return supabase.from('businesses').select('id, name, slug, timezone').maybeSingle();
}

async function businessHasBookings(supabase: SupabaseClient, businessId: string): Promise<{ hasBookings?: boolean; error?: unknown }> {
  const { count, error } = await supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
  if (error) return { error };
  return { hasBookings: (count ?? 0) > 0 };
}

function withHasBookings(row: Omit<Business, 'hasBookings'>, hasBookings: boolean): Business {
  return { ...row, hasBookings };
}

function databaseTimeToLocal(value: string) {
  return value.slice(0, 5);
}

function validateWindows(value: unknown): { windows?: AvailabilityWindow[]; error?: Fields; malformed?: boolean } {
  if (!Array.isArray(value)) return { error: { windows: 'Provide a list of weekly windows.' }, malformed: true };
  const fields: Fields = {};
  const windows: AvailabilityWindow[] = [];
  const seen = new Set<number>();

  value.forEach((item, index) => {
    const prefix = `windows.${index}`;
    const obj = recordBody(item);
    if (!obj) {
      fields[prefix] = 'Enter a weekday and opening times.';
      return;
    }
    const unknown = rejectUnknownKeys(obj, ['weekday', 'startLocal', 'endLocal']);
    if (Object.keys(unknown).length) {
      Object.keys(unknown).forEach((key) => { fields[`${prefix}.${key}`] = unknown[key]!; });
      return;
    }
    if (!Number.isInteger(obj.weekday)) fields[`${prefix}.weekday`] = 'Choose a weekday.';
    if (typeof obj.startLocal !== 'string' || !timePattern.test(obj.startLocal)) fields[`${prefix}.startLocal`] = 'Use a 24-hour time such as 09:00.';
    if (typeof obj.endLocal !== 'string' || !timePattern.test(obj.endLocal)) fields[`${prefix}.endLocal`] = 'Use a 24-hour time such as 17:00.';
  });
  if (Object.keys(fields).length) return { error: fields, malformed: true };

  value.forEach((item, index) => {
    const obj = item as Record<string, unknown>;
    const weekday = obj.weekday as number;
    const startLocal = obj.startLocal as string;
    const endLocal = obj.endLocal as string;
    if (weekday < 0 || weekday > 6) fields[`windows.${index}.weekday`] = 'Choose a weekday from Sunday to Saturday.';
    if (seen.has(weekday)) fields[`windows.${index}.weekday`] = 'Each weekday can appear only once.';
    seen.add(weekday);
    const startMinute = Number(startLocal.slice(0, 2)) * 60 + Number(startLocal.slice(3, 5));
    const endMinute = Number(endLocal.slice(0, 2)) * 60 + Number(endLocal.slice(3, 5));
    if (startMinute % 15 !== 0) fields[`windows.${index}.startLocal`] = 'Use 15-minute intervals.';
    if (endMinute % 15 !== 0) fields[`windows.${index}.endLocal`] = 'Use 15-minute intervals.';
    if (startMinute >= endMinute) fields[`windows.${index}.endLocal`] = 'Closing time must be later than opening time.';
    windows.push({ weekday, startLocal, endLocal });
  });
  return Object.keys(fields).length ? { error: fields } : { windows };
}

export function registerOwnerRoutes(router: Router) {
  router.get('/business', async (_req: Request, res: Response) => {
    const supabase = ownerClient(res);
    const { data, error } = await ownBusiness(supabase);
    if (error) return databaseError(res, 'We could not load your business setup.', error);
    if (!data) return res.json({ data: null });
    const bookings = await businessHasBookings(supabase, data.id);
    if (bookings.error) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not load your business setup.');
    return res.json({ data: withHasBookings(data, bookings.hasBookings ?? false) });
  });

  router.post('/business', async (req: Request, res: Response) => {
    const body = recordBody(req.body);
    if (!body) return sendError(res, 400, 'INVALID_REQUEST', 'Send a JSON object to create your business.');
    if (!isObjectShapeValid(body, res, ['name', 'slug', 'timezone'])) return;
    if (isMalformed(body, res, ['name', 'slug', 'timezone'])) return;
    const typeFields: Fields = {};
    if (typeof body.name !== 'string') typeFields.name = 'Enter a text name.';
    if (typeof body.slug !== 'string') typeFields.slug = 'Enter a text booking link name.';
    if (typeof body.timezone !== 'string') typeFields.timezone = 'Enter a text time zone.';
    if (Object.keys(typeFields).length) return sendError(res, 400, 'INVALID_REQUEST', 'Check the request fields and try again.', typeFields);
    const name = validateName(body.name);
    const slug = (body.slug as string).trim();
    const timezone = validateTimezone(body.timezone);
    const fields: Fields = { ...(name.error ?? {}), ...(timezone.error ?? {}) };
    if (!slugPattern.test(slug)) fields.slug = 'Use lowercase letters, numbers, and single hyphens.';
    if (Object.keys(fields).length) return sendError(res, 422, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);

    const { id: ownerId } = (res.locals as OwnerLocals).owner;
    const { data, error } = await ownerClient(res).from('businesses')
      .insert({ owner_id: ownerId, name: name.value!, slug: slug!, timezone: timezone.value! })
      .select('id, name, slug, timezone')
      .single();
    if (error) return databaseError(res, 'We could not create your business. Try again.', error, 'That booking link is already taken. Choose another.');
    return res.status(201).json({ data: withHasBookings(data, false) });
  });

  router.patch('/business', async (req: Request, res: Response) => {
    const body = recordBody(req.body);
    if (!body) return sendError(res, 400, 'INVALID_REQUEST', 'Send a JSON object to update your business.');
    if (!isObjectShapeValid(body, res, ['name', 'timezone'])) return;
    if (Object.keys(body).length === 0) return sendError(res, 400, 'INVALID_REQUEST', 'Provide a business setting to update.');
    const typeFields: Fields = {};
    if ('name' in body && typeof body.name !== 'string') typeFields.name = 'Enter a text name.';
    if ('timezone' in body && typeof body.timezone !== 'string') typeFields.timezone = 'Enter a text time zone.';
    if (Object.keys(typeFields).length) return sendError(res, 400, 'INVALID_REQUEST', 'Check the request fields and try again.', typeFields);
    const updates: Record<string, string> = {};
    const fields: Fields = {};
    if ('name' in body) {
      const result = validateName(body.name);
      if (result.error) Object.assign(fields, result.error);
      else updates.name = result.value!;
    }
    if ('timezone' in body) {
      const result = validateTimezone(body.timezone);
      if (result.error) Object.assign(fields, result.error);
      else updates.timezone = result.value!;
    }
    if (Object.keys(fields).length) return sendError(res, 422, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);

    const supabase = ownerClient(res);
    const { data: current, error: lookupError } = await ownBusiness(supabase);
    if (lookupError) return databaseError(res, 'We could not update your business. Try again.', lookupError);
    if (!current) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');
    const bookings = await businessHasBookings(supabase, current.id);
    if (bookings.error) return sendError(res, 500, 'INTERNAL_ERROR', 'We could not verify whether your time zone can be changed.');
    if ('timezone' in updates && bookings.hasBookings) return sendError(res, 422, 'TIMEZONE_LOCKED', 'Your time zone is locked after your first booking to preserve appointment history.', { timezone: 'This setting is locked after the first booking.' });
    const { data, error } = await supabase.from('businesses').update(updates)
      .eq('id', current.id).select('id, name, slug, timezone').maybeSingle();
    if (error) return databaseError(res, 'We could not update your business. Try again.', error);
    if (!data) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');
    return res.json({ data: withHasBookings(data, bookings.hasBookings ?? false) });
  });

  router.get('/services', async (_req: Request, res: Response) => {
    const { data, error } = await ownerClient(res).from('services')
      .select('id, name, duration_minutes, is_active, created_at, updated_at')
      .order('created_at', { ascending: true });
    if (error) return databaseError(res, 'We could not load your services.', error);
    return res.json({ data: (data ?? []).map((service) => ({
      id: service.id, name: service.name, durationMinutes: service.duration_minutes,
      isActive: service.is_active, createdAt: service.created_at, updatedAt: service.updated_at,
    })) });
  });

  router.post('/services', async (req: Request, res: Response) => {
    const body = recordBody(req.body);
    if (!body) return sendError(res, 400, 'INVALID_REQUEST', 'Send a JSON object to create a service.');
    if (!isObjectShapeValid(body, res, ['name', 'durationMinutes'])) return;
    if (isMalformed(body, res, ['name', 'durationMinutes'])) return;
    const typeFields: Fields = {};
    if (typeof body.name !== 'string') typeFields.name = 'Enter a text service name.';
    if (typeof body.durationMinutes !== 'number') typeFields.durationMinutes = 'Enter a number of minutes.';
    if (Object.keys(typeFields).length) return sendError(res, 400, 'INVALID_REQUEST', 'Check the request fields and try again.', typeFields);
    const name = validateName(body.name);
    const durationMinutes = body.durationMinutes as number;
    const fields: Fields = { ...(name.error ?? {}) };
    if (!Number.isInteger(durationMinutes)) fields.durationMinutes = 'Enter a whole number of minutes.';
    else if (durationMinutes < 15 || durationMinutes > 240 || durationMinutes % 15 !== 0) fields.durationMinutes = 'Choose a duration from 15 to 240 minutes in 15-minute intervals.';
    if (Object.keys(fields).length) return sendError(res, 422, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);

    const supabase = ownerClient(res);
    const { data: business, error: businessError } = await ownBusiness(supabase);
    if (businessError) return databaseError(res, 'We could not create the service. Try again.', businessError);
    if (!business) return sendError(res, 404, 'NOT_FOUND', 'Create your business setup first.');
    const { data, error } = await supabase.from('services')
      .insert({ business_id: business.id, name: name.value!, duration_minutes: durationMinutes })
      .select('id, name, duration_minutes, is_active, created_at, updated_at').single();
    if (error) return databaseError(res, 'We could not create the service. Try again.', error);
    return res.status(201).json({ data: {
      id: data.id, name: data.name, durationMinutes: data.duration_minutes,
      isActive: data.is_active, createdAt: data.created_at, updatedAt: data.updated_at,
    } });
  });

  router.patch('/services/:id', async (req: Request, res: Response) => {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return sendError(res, 400, 'INVALID_REQUEST', 'Use a valid service ID.');
    }
    const body = recordBody(req.body);
    if (!body) return sendError(res, 400, 'INVALID_REQUEST', 'Send a JSON object to update a service.');
    if (!isObjectShapeValid(body, res, ['name', 'durationMinutes', 'isActive'])) return;
    if (Object.keys(body).length === 0) return sendError(res, 400, 'INVALID_REQUEST', 'Provide a service setting to update.');
    const typeFields: Fields = {};
    if ('name' in body && typeof body.name !== 'string') typeFields.name = 'Enter a text service name.';
    if ('durationMinutes' in body && typeof body.durationMinutes !== 'number') typeFields.durationMinutes = 'Enter a number of minutes.';
    if ('isActive' in body && typeof body.isActive !== 'boolean') typeFields.isActive = 'Choose whether this service is active.';
    if (Object.keys(typeFields).length) return sendError(res, 400, 'INVALID_REQUEST', 'Check the request fields and try again.', typeFields);
    const updates: Record<string, string | number | boolean> = {};
    const fields: Fields = {};
    if ('name' in body) {
      const result = validateName(body.name);
      if (result.error) Object.assign(fields, result.error);
      else updates.name = result.value!;
    }
    if ('durationMinutes' in body) {
      const durationMinutes = body.durationMinutes as number;
      if (!Number.isInteger(durationMinutes)) fields.durationMinutes = 'Enter a whole number of minutes.';
      else if (durationMinutes < 15 || durationMinutes > 240 || durationMinutes % 15 !== 0) fields.durationMinutes = 'Choose a duration from 15 to 240 minutes in 15-minute intervals.';
      else updates.duration_minutes = durationMinutes;
    }
    if ('isActive' in body) {
      updates.is_active = body.isActive as boolean;
    }
    if (Object.keys(fields).length) return sendError(res, 422, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);
    const { data, error } = await ownerClient(res).from('services').update(updates)
      .eq('id', id).select('id, name, duration_minutes, is_active, created_at, updated_at').maybeSingle();
    if (error) return databaseError(res, 'We could not update the service. Try again.', error);
    if (!data) return sendError(res, 404, 'NOT_FOUND', 'That service was not found.');
    return res.json({ data: {
      id: data.id, name: data.name, durationMinutes: data.duration_minutes,
      isActive: data.is_active, createdAt: data.created_at, updatedAt: data.updated_at,
    } });
  });

  router.get('/availability', async (_req: Request, res: Response) => {
    const { data, error } = await ownerClient(res).from('weekly_availability')
      .select('weekday, start_local, end_local').order('weekday', { ascending: true });
    if (error) return databaseError(res, 'We could not load your weekly availability.', error);
    const rows = (data ?? []) as { weekday: number; start_local: string; end_local: string }[];
    const windows = rows.map((row) => ({ weekday: row.weekday, startLocal: databaseTimeToLocal(row.start_local), endLocal: databaseTimeToLocal(row.end_local) }));
    return res.json({ data: { windows } });
  });

  router.put('/availability', async (req: Request, res: Response) => {
    const body = recordBody(req.body);
    if (!body) return sendError(res, 400, 'INVALID_REQUEST', 'Send a JSON object to save availability.');
    if (!isObjectShapeValid(body, res, ['windows'])) return;
    if (isMalformed(body, res, ['windows'])) return;
    const result = validateWindows(body.windows);
    if (result.error) return sendError(res, result.malformed ? 400 : 422, result.malformed ? 'INVALID_REQUEST' : 'VALIDATION_ERROR', result.malformed ? 'Check the weekly availability fields.' : 'Check the highlighted opening times.', result.error);
    const { data, error } = await ownerClient(res).rpc('replace_owner_weekly_availability', { p_windows: result.windows });
    if (error) return databaseError(res, 'We could not save your weekly availability. Try again.', error);
    const rows = (data ?? []) as { weekday: number; start_local: string; end_local: string }[];
    const windows = rows.map((row) => ({ weekday: row.weekday, startLocal: databaseTimeToLocal(row.start_local), endLocal: databaseTimeToLocal(row.end_local) }));
    return res.json({ data: { windows } });
  });

  registerOwnerBookingRoutes(router);
}
