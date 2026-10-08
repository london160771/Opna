import type { AppConfig } from './config.js';

export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type TransactionalEmailSender = (email: TransactionalEmail) => Promise<void>;
export type EmailFailureReporter = (flow: string) => void;
export type TransactionalEmailRuntime = {
  enabled: boolean;
  send: TransactionalEmailSender;
  reportFailure: EmailFailureReporter;
  appUrl?: string;
};

type AppointmentEmailDetails = {
  businessName: string;
  businessSlug: string;
  serviceName: string;
  customerName: string;
  customerEmail: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  reference?: string;
  durationMinutes?: number;
  cancellationMessage?: string | null;
};

export function createResendEmailSender(config: AppConfig, request: typeof fetch = fetch): TransactionalEmailSender {
  return async (email) => {
    if (!config.resendApiKey || !config.emailFrom) throw new Error('Transactional email is not configured.');

    const response = await request('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({ from: config.emailFrom, ...email }),
    });
    if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`);
  };
}

export function reportEmailFailure(flow: string) {
  console.error('Transactional email delivery failed.', { flow });
}

export function reportEmailFailureSafely(runtime: TransactionalEmailRuntime, flow: string) {
  if (!runtime.enabled) return;
  try { runtime.reportFailure(flow); } catch { /* logging must not affect a committed booking action */ }
}

export async function sendEmailBestEffort(runtime: TransactionalEmailRuntime, flow: string, email: TransactionalEmail) {
  if (!runtime.enabled) return;
  try {
    await runtime.send(email);
  } catch {
    reportEmailFailureSafely(runtime, flow);
  }
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

function escapeEmailHtmlWithBreaks(value: string) {
  return escapeEmailHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function appointmentTime(details: AppointmentEmailDetails) {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: details.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(details.startsAt));
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: details.timezone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${date}, ${time.format(new Date(details.startsAt))} – ${time.format(new Date(details.endsAt))}`;
}

function emailHtml(title: string, introduction: string, fields: Array<[string, string]>, extra = '') {
  const rows = fields.map(([label, value]) => `<p><strong>${escapeEmailHtml(label)}:</strong> ${escapeEmailHtml(value)}</p>`).join('');
  return `<!doctype html><html><body><main style="font-family:Arial,sans-serif;line-height:1.55;color:#172033;max-width:600px;margin:24px auto;padding:24px"><h1 style="font-size:22px">${escapeEmailHtml(title)}</h1><p>${escapeEmailHtml(introduction)}</p>${rows}${extra}</main></body></html>`;
}

function textFields(fields: Array<[string, string]>) {
  return fields.map(([label, value]) => `${label}: ${value}`).join('\n');
}

function subjectName(value: string) {
  return value.replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 100);
}

export function createCustomerBookingConfirmation(details: AppointmentEmailDetails): TransactionalEmail {
  const time = appointmentTime(details);
  const fields: Array<[string, string]> = [
    ['Business', details.businessName],
    ['Service', details.serviceName],
    ['Appointment', time],
    ['Business time zone', details.timezone],
    ['Duration', `${details.durationMinutes ?? ''} minutes`],
    ['Booking reference', details.reference ?? ''],
  ];
  return {
    to: details.customerEmail,
    subject: `Booking confirmed: ${subjectName(details.businessName)}`,
    html: emailHtml('Booking confirmed', `Hello ${details.customerName}, your booking is confirmed.`, fields),
    text: `Your booking is confirmed.\n\n${textFields(fields)}`,
  };
}

export function createOwnerNewBookingNotification(details: AppointmentEmailDetails, ownerEmail: string): TransactionalEmail {
  const fields: Array<[string, string]> = [
    ['Customer', details.customerName],
    ['Customer email', details.customerEmail],
    ['Service', details.serviceName],
    ['Appointment', appointmentTime(details)],
    ['Business time zone', details.timezone],
  ];
  return {
    to: ownerEmail,
    subject: `New booking: ${subjectName(details.businessName)}`,
    html: emailHtml('New booking', `${details.businessName} has a new booking.`, fields),
    text: `Your business has a new booking.\n\n${textFields(fields)}`,
  };
}

export function createOwnerCancellationEmail(details: AppointmentEmailDetails, appUrl: string): TransactionalEmail {
  const bookingUrl = new URL(`/book/${encodeURIComponent(details.businessSlug)}`, appUrl).toString();
  const fields: Array<[string, string]> = [
    ['Business', details.businessName],
    ['Service', details.serviceName],
    ['Cancelled appointment', appointmentTime(details)],
    ['Business time zone', details.timezone],
  ];
  const customMessage = details.cancellationMessage?.trim();
  const extraHtml = `${customMessage ? `<h2 style="font-size:16px">Message from the business</h2><blockquote style="margin:8px 0 20px;padding-left:16px;border-left:3px solid #cbd5e1">${escapeEmailHtmlWithBreaks(customMessage)}</blockquote>` : ''}<p><a href="${escapeEmailHtml(bookingUrl)}">Book another time</a></p>`;
  return {
    to: details.customerEmail,
    subject: `Booking cancelled: ${subjectName(details.businessName)}`,
    html: emailHtml('Booking cancelled', `Your appointment with ${details.businessName} has been cancelled.`, fields, extraHtml),
    text: `Your appointment has been cancelled.\n\n${textFields(fields)}${customMessage ? `\n\nMessage from the business:\n${customMessage}` : ''}\n\nBook another time: ${bookingUrl}`,
  };
}
