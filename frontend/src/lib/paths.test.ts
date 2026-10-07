import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './paths';

describe('safeReturnPath', () => {
  it('keeps local owner routes', () => {
    expect(safeReturnPath('/app/bookings?status=confirmed')).toBe('/app/bookings?status=confirmed');
  });

  it('rejects external and non-owner destinations', () => {
    expect(safeReturnPath('https://example.com/app')).toBe('/app');
    expect(safeReturnPath('//example.com/app')).toBe('/app');
    expect(safeReturnPath('/login')).toBe('/app');
  });
});
