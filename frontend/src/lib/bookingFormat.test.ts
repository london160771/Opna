import { describe, expect, it } from 'vitest';
import { formatBookingDate, formatBookingDateTime, formatBookingTime } from './bookingFormat';

describe('booking date formatting', () => {
  it('uses the business timezone instead of the browser timezone', () => {
    const startsAt = '2026-10-08T09:00:00.000Z';
    expect(formatBookingDate(startsAt, 'Europe/London')).toBe('Thursday, October 8, 2026');
    expect(formatBookingTime(startsAt, 'Europe/London')).toBe('10:00 AM');
    expect(formatBookingDateTime(startsAt, 'Europe/London')).toBe('Thursday, October 8, 2026 · 10:00 AM');
  });
});
