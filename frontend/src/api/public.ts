import { apiBaseUrl } from '../lib/config';

export type PublicService = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type PublicBusiness = {
  name: string;
  slug: string;
  timezone: string;
  services: PublicService[];
  bookingWindow: {
    today: string;
    lastBookableDate: string;
  };
  isBookable: boolean;
};

export type PublicSlot = {
  startsAt: string;
  endsAt: string;
};

export type BookingConfirmation = {
  reference: string;
  businessName: string;
  serviceName: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: 'confirmed';
};

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/public${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new PublicApiError('We could not reach Opna. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let payload: { error?: { code?: string; message?: string; fields?: Record<string, string> } } = {};
    try { payload = await response.json() as typeof payload; } catch { /* use a safe fallback */ }
    throw new PublicApiError(
      payload.error?.message ?? 'We could not complete that request. Try again.',
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.fields ?? {},
    );
  }
  const payload = await response.json() as { data: T };
  return payload.data;
}

export function searchPublicBusinesses(query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ query });
  return publicRequest<{ name: string; slug: string }[]>(`/businesses?${params}`, { signal });
}

export function getPublicBusiness(slug: string, signal?: AbortSignal) {
  return publicRequest<PublicBusiness>(`/businesses/${encodeURIComponent(slug)}`, { signal });
}

export function getPublicSlots(slug: string, serviceId: string, date: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ serviceId, date });
  return publicRequest<{ timezone: string; date: string; slots: PublicSlot[] }>(
    `/businesses/${encodeURIComponent(slug)}/slots?${params}`,
    { signal },
  );
}

export function submitPublicBooking(slug: string, input: {
  serviceId: string;
  startsAt: string;
  customerName: string;
  customerEmail: string;
}) {
  return publicRequest<BookingConfirmation>(`/businesses/${encodeURIComponent(slug)}/bookings`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
