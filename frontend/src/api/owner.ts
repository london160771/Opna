import { apiBaseUrl } from '../lib/config';

export type OwnerBusiness = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  hasBookings: boolean;
};

export type OwnerService = {
  id: string;
  name: string;
  durationMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AvailabilityWindow = {
  weekday: number;
  startLocal: string;
  endLocal: string;
};

export type BookingStatus = 'confirmed' | 'completed' | 'cancelled';

export type OwnerBooking = {
  id: string;
  businessId: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  customerName: string;
  customerEmail?: string;
  cancellationMessage?: string | null;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnerDashboard = {
  counts: { upcoming: number; completed: number; cancelled: number };
  nextBooking: OwnerBooking | null;
};

export type OwnerBookingsPage = {
  bookings: OwnerBooking[];
  nextCursor: string | null;
};

export type OwnerFieldErrors = Record<string, string>;

export class OwnerApiError extends Error {
  fields: OwnerFieldErrors;
  code: string;

  constructor(message: string, code = 'REQUEST_FAILED', fields: OwnerFieldErrors = {}) {
    super(message);
    this.name = 'OwnerApiError';
    this.code = code;
    this.fields = fields;
  }
}

async function ownerRequest<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/owner${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new OwnerApiError('We could not reach Opna. Check your connection and try again.');
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; fields?: OwnerFieldErrors } } = {};
    try { payload = await response.json() as typeof payload; } catch { /* keep a safe generic message */ }
    const code = payload.error?.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'REQUEST_FAILED');
    const message = response.status === 401
      ? 'Your session has expired. Please sign in again.'
      : payload.error?.message ?? 'We could not save your changes. Try again.';
    throw new OwnerApiError(message, code, payload.error?.fields ?? {});
  }

  const payload = await response.json() as { data: T };
  return payload.data;
}

export function getOwnerBusiness(accessToken: string) {
  return ownerRequest<OwnerBusiness | null>(accessToken, '/business');
}

export function createOwnerBusiness(accessToken: string, input: { name: string; slug: string; timezone: string }) {
  return ownerRequest<OwnerBusiness>(accessToken, '/business', { method: 'POST', body: JSON.stringify(input) });
}

export function updateOwnerBusiness(accessToken: string, input: { name?: string; timezone?: string }) {
  return ownerRequest<OwnerBusiness>(accessToken, '/business', { method: 'PATCH', body: JSON.stringify(input) });
}

export function getOwnerServices(accessToken: string) {
  return ownerRequest<OwnerService[]>(accessToken, '/services');
}

export function createOwnerService(accessToken: string, input: { name: string; durationMinutes: number }) {
  return ownerRequest<OwnerService>(accessToken, '/services', { method: 'POST', body: JSON.stringify(input) });
}

export function updateOwnerService(accessToken: string, id: string, input: Partial<Pick<OwnerService, 'name' | 'durationMinutes' | 'isActive'>>) {
  return ownerRequest<OwnerService>(accessToken, `/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function getOwnerAvailability(accessToken: string) {
  return ownerRequest<{ windows: AvailabilityWindow[] }>(accessToken, '/availability');
}

export function saveOwnerAvailability(accessToken: string, windows: AvailabilityWindow[]) {
  return ownerRequest<{ windows: AvailabilityWindow[] }>(accessToken, '/availability', { method: 'PUT', body: JSON.stringify({ windows }) });
}

export function getOwnerDashboard(accessToken: string) {
  return ownerRequest<OwnerDashboard>(accessToken, '/dashboard');
}

export function getOwnerBookings(accessToken: string, cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return ownerRequest<OwnerBookingsPage>(accessToken, `/bookings${query}`);
}

export function getOwnerBooking(accessToken: string, id: string) {
  return ownerRequest<OwnerBooking>(accessToken, `/bookings/${encodeURIComponent(id)}`);
}

export function updateOwnerBookingStatus(accessToken: string, id: string, status: 'completed' | 'cancelled', cancellationMessage?: string) {
  return ownerRequest<OwnerBooking>(accessToken, `/bookings/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status, ...(cancellationMessage === undefined ? {} : { cancellationMessage }) }),
  });
}
