import { describe, expect, it } from 'vitest';
import { BookingRuleError, generateBookingSlots, getBookingDateRange, resolveBookableSlot } from '../src/bookingRules.js';

const openWednesday = [{ weekday: 3, startLocal: '09:00', endLocal: '10:00' }];
const now = new Date('2026-10-07T07:00:00.000Z');

describe('business-local booking rules', () => {
  it('builds the inclusive 30-date window in the business time zone', () => {
    expect(getBookingDateRange('Europe/London', new Date('2026-10-07T23:30:00.000Z')))
      .toEqual({ today: '2026-10-08', lastBookableDate: '2026-11-06' });
  });

  it('generates 15-minute starts whose full service duration fits the local window', () => {
    const slots = generateBookingSlots({
      date: '2026-10-07', timezone: 'Europe/London', durationMinutes: 30,
      availability: openWednesday, occupied: [], now,
    });
    expect(slots).toEqual([
      { startsAt: '2026-10-07T08:00:00Z', endsAt: '2026-10-07T08:30:00Z' },
      { startsAt: '2026-10-07T08:15:00Z', endsAt: '2026-10-07T08:45:00Z' },
      { startsAt: '2026-10-07T08:30:00Z', endsAt: '2026-10-07T09:00:00Z' },
    ]);
  });

  it('rejects dates before today and after the inclusive 29-day offset', () => {
    const generate = (date: string) => generateBookingSlots({
      date, timezone: 'Europe/London', durationMinutes: 15,
      availability: openWednesday, occupied: [], now,
    });
    expect(() => generate('2026-10-06')).toThrowError(BookingRuleError);
    expect(() => generate('2026-11-05')).not.toThrow();
    expect(() => generate('2026-11-06')).toThrowError(BookingRuleError);
  });

  it('omits starts at or before the current instant', () => {
    const slots = generateBookingSlots({
      date: '2026-10-07', timezone: 'Europe/London', durationMinutes: 15,
      availability: [{ weekday: 3, startLocal: '09:00', endLocal: '10:00' }],
      occupied: [], now: new Date('2026-10-07T08:15:00.000Z'),
    });
    expect(slots.map((slot) => slot.startsAt)).toEqual(['2026-10-07T08:30:00Z', '2026-10-07T08:45:00Z']);
  });

  it('uses half-open occupancy intervals so touching appointments remain available', () => {
    const slots = generateBookingSlots({
      date: '2026-10-07', timezone: 'Europe/London', durationMinutes: 30,
      availability: openWednesday,
      occupied: [{ startsAt: '2026-10-07T08:30:00Z', endsAt: '2026-10-07T09:00:00Z' }],
      now,
    });
    expect(slots.map((slot) => slot.startsAt)).toEqual(['2026-10-07T08:00:00Z']);
  });

  it('omits nonexistent and ambiguous local starts at daylight-saving transitions', () => {
    const spring = generateBookingSlots({
      date: '2026-03-29', timezone: 'Europe/London', durationMinutes: 15,
      availability: [{ weekday: 0, startLocal: '00:00', endLocal: '04:00' }], occupied: [],
      now: new Date('2026-03-01T00:00:00.000Z'),
    });
    expect(spring.map((slot) => slot.startsAt)).toEqual([
      '2026-03-29T00:00:00Z', '2026-03-29T00:15:00Z', '2026-03-29T00:30:00Z', '2026-03-29T00:45:00Z',
      '2026-03-29T01:00:00Z', '2026-03-29T01:15:00Z', '2026-03-29T01:30:00Z', '2026-03-29T01:45:00Z',
      '2026-03-29T02:00:00Z', '2026-03-29T02:15:00Z', '2026-03-29T02:30:00Z', '2026-03-29T02:45:00Z',
    ]);

    const autumn = generateBookingSlots({
      date: '2026-10-25', timezone: 'Europe/London', durationMinutes: 15,
      availability: [{ weekday: 0, startLocal: '00:00', endLocal: '03:00' }], occupied: [],
      now: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(autumn.map((slot) => slot.startsAt)).toEqual([
      '2026-10-24T23:00:00Z', '2026-10-24T23:15:00Z', '2026-10-24T23:30:00Z', '2026-10-24T23:45:00Z',
      '2026-10-25T02:00:00Z', '2026-10-25T02:15:00Z', '2026-10-25T02:30:00Z', '2026-10-25T02:45:00Z',
    ]);
  });

  it('revalidates the selected start against current availability and occupancy', () => {
    expect(resolveBookableSlot({
      startsAt: '2026-10-07T08:00:00Z', timezone: 'Europe/London', durationMinutes: 30,
      availability: openWednesday, occupied: [], now,
    })).toEqual({ startsAt: '2026-10-07T08:00:00Z', endsAt: '2026-10-07T08:30:00Z' });

    expect(() => resolveBookableSlot({
      startsAt: '2026-10-07T08:00:00Z', timezone: 'Europe/London', durationMinutes: 30,
      availability: openWednesday,
      occupied: [{ startsAt: '2026-10-07T08:15:00Z', endsAt: '2026-10-07T08:45:00Z' }],
      now,
    })).toThrowError(expect.objectContaining({ code: 'SLOT_UNAVAILABLE', status: 409 }));
  });
});
