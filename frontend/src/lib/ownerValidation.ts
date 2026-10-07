import type { AvailabilityWindow } from '../api/owner';

export type ValidationErrors = Record<string, string>;

export function suggestBusinessSlug(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-+/g, '-');
}

export function validateBusinessInput(name: string, slug: string, timezone: string): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!name.trim()) errors.name = 'Enter your business name.';
  else if (name.trim().length > 120) errors.name = 'Use 120 characters or fewer.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.slug = 'Use lowercase letters, numbers, and single hyphens.';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
  catch { errors.timezone = 'Enter a valid time zone, such as Europe/London.'; }
  if (!timezone.trim()) errors.timezone = 'Choose a time zone.';
  return errors;
}

export function validateServiceInput(name: string, durationMinutes: number): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!name.trim()) errors.name = 'Enter a service name.';
  else if (name.trim().length > 120) errors.name = 'Use 120 characters or fewer.';
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240 || durationMinutes % 15 !== 0) {
    errors.durationMinutes = 'Choose 15 to 240 minutes in 15-minute intervals.';
  }
  return errors;
}

export function validateAvailabilityWindows(windows: AvailabilityWindow[]): ValidationErrors {
  const errors: ValidationErrors = {};
  windows.forEach((window, index) => {
    const prefix = `windows.${index}`;
    const validStart = /^([01]\d|2[0-3]):[0-5]\d$/.test(window.startLocal);
    const validEnd = /^([01]\d|2[0-3]):[0-5]\d$/.test(window.endLocal);
    if (!validStart) errors[`${prefix}.startLocal`] = 'Enter a valid opening time.';
    if (!validEnd) errors[`${prefix}.endLocal`] = 'Enter a valid closing time.';
    if (!validStart || !validEnd) return;
    const startMinutes = Number(window.startLocal.slice(0, 2)) * 60 + Number(window.startLocal.slice(3, 5));
    const endMinutes = Number(window.endLocal.slice(0, 2)) * 60 + Number(window.endLocal.slice(3, 5));
    if (startMinutes % 15 !== 0) errors[`${prefix}.startLocal`] = 'Choose a 15-minute interval.';
    if (endMinutes % 15 !== 0) errors[`${prefix}.endLocal`] = 'Choose a 15-minute interval.';
    if (startMinutes >= endMinutes) errors[`${prefix}.endLocal`] = 'Closing time must be later than opening time.';
  });
  return errors;
}
