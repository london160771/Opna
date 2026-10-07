import { describe, expect, it } from 'vitest';
import { suggestBusinessSlug, validateAvailabilityWindows, validateBusinessInput, validateServiceInput } from './ownerValidation';

describe('Phase 1 owner input validation', () => {
  it('suggests a normalized booking slug from a business name', () => {
    expect(suggestBusinessSlug('Café & Northside Studio')).toBe('cafe-northside-studio');
    expect(suggestBusinessSlug('  Two   Spaces  ')).toBe('two-spaces');
  });

  it('accepts a valid profile and rejects an invalid slug or timezone', () => {
    expect(validateBusinessInput('Northside Studio', 'northside-studio', 'Europe/London')).toEqual({});
    expect(validateBusinessInput('', 'Northside', 'Not/AZone')).toEqual({
      name: 'Enter your business name.',
      slug: 'Use lowercase letters, numbers, and single hyphens.',
      timezone: 'Enter a valid time zone, such as Europe/London.',
    });
  });

  it('enforces service duration bounds and 15-minute intervals', () => {
    expect(validateServiceInput('Consultation', 15)).toEqual({});
    expect(validateServiceInput('Consultation', 240)).toEqual({});
    expect(validateServiceInput('Consultation', 14).durationMinutes).toBeTruthy();
    expect(validateServiceInput('Consultation', 241).durationMinutes).toBeTruthy();
    expect(validateServiceInput('Consultation', 20).durationMinutes).toBeTruthy();
  });

  it('checks weekly windows for 15-minute boundaries and same-day ordering', () => {
    expect(validateAvailabilityWindows([{ weekday: 1, startLocal: '09:00', endLocal: '17:00' }])).toEqual({});
    expect(validateAvailabilityWindows([
      { weekday: 1, startLocal: '09:10', endLocal: '17:00' },
      { weekday: 2, startLocal: '22:00', endLocal: '02:00' },
    ])).toEqual({
      'windows.0.startLocal': 'Choose a 15-minute interval.',
      'windows.1.endLocal': 'Closing time must be later than opening time.',
    });
  });
});
