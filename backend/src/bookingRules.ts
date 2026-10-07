import { Temporal } from '@js-temporal/polyfill';

export type BookingWindow = {
  weekday: number;
  startLocal: string;
  endLocal: string;
};

export type OccupiedInterval = {
  startsAt: string;
  endsAt: string;
};

export type BookingSlot = {
  startsAt: string;
  endsAt: string;
};

export type BookingDateRange = {
  today: string;
  lastBookableDate: string;
};

export class BookingRuleError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BookingRuleError';
  }
}

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minDuration = 15;
const maxDuration = 240;
const slotIntervalMinutes = 15;
const bookingHorizonDays = 29;

function parseDate(value: string): Temporal.PlainDate {
  if (!localDatePattern.test(value)) {
    throw new BookingRuleError('Choose a valid booking date.', 'INVALID_DATE', 400);
  }
  try {
    const date = Temporal.PlainDate.from(value, { overflow: 'reject' });
    if (date.toString() !== value) throw new RangeError('Non-canonical date');
    return date;
  } catch {
    throw new BookingRuleError('Choose a valid booking date.', 'INVALID_DATE', 400);
  }
}

function timeToMinutes(value: string): number | null {
  const match = localTimePattern.exec(value.slice(0, 5));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function zonedStart(date: Temporal.PlainDate, minuteOfDay: number, timezone: string) {
  return Temporal.ZonedDateTime.from({
    timeZone: timezone,
    year: date.year,
    month: date.month,
    day: date.day,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  }, { disambiguation: 'reject' });
}

export function getBookingDateRange(timezone: string, now = new Date()): BookingDateRange {
  const today = Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDate();
  return {
    today: today.toString(),
    lastBookableDate: today.add({ days: bookingHorizonDays }).toString(),
  };
}

export function validateBookableDate(dateValue: string, timezone: string, now = new Date()) {
  const date = parseDate(dateValue);
  const { today, lastBookableDate } = getBookingDateRange(timezone, now);
  if (Temporal.PlainDate.compare(date, Temporal.PlainDate.from(today)) < 0
    || Temporal.PlainDate.compare(date, Temporal.PlainDate.from(lastBookableDate)) > 0) {
    throw new BookingRuleError(
      'Choose a date from today through the next 29 days in the business time zone.',
      'DATE_OUT_OF_RANGE',
      422,
    );
  }
  return date;
}

export function generateBookingSlots(input: {
  date: string;
  timezone: string;
  durationMinutes: number;
  availability: BookingWindow[];
  occupied: OccupiedInterval[];
  now?: Date;
}): BookingSlot[] {
  const { date, timezone, durationMinutes, availability, occupied } = input;
  const now = input.now ?? new Date();
  const localDate = validateBookableDate(date, timezone, now);
  if (!Number.isInteger(durationMinutes) || durationMinutes < minDuration
    || durationMinutes > maxDuration || durationMinutes % slotIntervalMinutes !== 0) {
    throw new BookingRuleError('That service cannot be booked right now.', 'SERVICE_UNAVAILABLE', 422);
  }

  const weekday = localDate.dayOfWeek % 7;
  const window = availability.find((item) => item.weekday === weekday);
  if (!window) return [];
  const windowStart = timeToMinutes(window.startLocal);
  const windowEnd = timeToMinutes(window.endLocal);
  if (windowStart === null || windowEnd === null || windowStart >= windowEnd) return [];

  const nowInstant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
  const occupiedInstants = occupied.map((interval) => ({
    start: Temporal.Instant.from(interval.startsAt),
    end: Temporal.Instant.from(interval.endsAt),
  }));
  const slots: BookingSlot[] = [];

  for (let minute = windowStart; minute + durationMinutes <= windowEnd; minute += slotIntervalMinutes) {
    let start: Temporal.ZonedDateTime;
    try {
      // Reject both gaps and repeated local times; never invent a customer's intended instant.
      start = zonedStart(localDate, minute, timezone);
    } catch {
      continue;
    }
    const startInstant = start.toInstant();
    if (Temporal.Instant.compare(startInstant, nowInstant) <= 0) continue;

    const endInstant = startInstant.add({ minutes: durationMinutes });
    const endLocal = endInstant.toZonedDateTimeISO(timezone);
    const localEndMinute = endLocal.hour * 60 + endLocal.minute;
    if (!endLocal.toPlainDate().equals(localDate) || localEndMinute > windowEnd) continue;

    const overlaps = occupiedInstants.some(({ start: occupiedStart, end: occupiedEnd }) =>
      Temporal.Instant.compare(startInstant, occupiedEnd) < 0
      && Temporal.Instant.compare(endInstant, occupiedStart) > 0);
    if (overlaps) continue;

    slots.push({ startsAt: startInstant.toString(), endsAt: endInstant.toString() });
  }
  return slots;
}

export function resolveBookableSlot(input: {
  startsAt: unknown;
  timezone: string;
  durationMinutes: number;
  availability: BookingWindow[];
  occupied: OccupiedInterval[];
  now?: Date;
}): BookingSlot {
  if (typeof input.startsAt !== 'string') {
    throw new BookingRuleError('Choose an available time.', 'INVALID_REQUEST', 400);
  }
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(input.startsAt);
  } catch {
    throw new BookingRuleError('Choose a valid booking time.', 'INVALID_REQUEST', 400);
  }
  const localStart = instant.toZonedDateTimeISO(input.timezone);
  if (localStart.second !== 0 || localStart.millisecond !== 0 || localStart.microsecond !== 0
    || localStart.nanosecond !== 0 || localStart.minute % slotIntervalMinutes !== 0) {
    throw new BookingRuleError('Choose a valid available time.', 'SLOT_UNAVAILABLE', 409);
  }

  const slot = generateBookingSlots({
    date: localStart.toPlainDate().toString(),
    timezone: input.timezone,
    durationMinutes: input.durationMinutes,
    availability: input.availability,
    occupied: input.occupied,
    now: input.now,
  }).find((candidate) => Temporal.Instant.from(candidate.startsAt).equals(instant));
  if (!slot) {
    throw new BookingRuleError('That time is no longer available. Choose another time.', 'SLOT_UNAVAILABLE', 409);
  }
  return slot;
}
