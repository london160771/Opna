export function formatBookingDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatBookingTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatBookingDateTime(value: string, timezone: string) {
  return `${formatBookingDate(value, timezone)} · ${formatBookingTime(value, timezone)}`;
}
