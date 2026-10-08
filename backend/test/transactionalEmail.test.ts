import { describe, expect, it, vi } from 'vitest';
import { createResendEmailSender, type TransactionalEmail } from '../src/transactionalEmail.js';
import type { AppConfig } from '../src/config.js';

const email: TransactionalEmail = {
  to: 'customer@example.test',
  subject: 'Opna email test',
  html: '<p>Test</p>',
  text: 'Test',
};

const config: AppConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'publishable-test-key',
  emailEnabled: true,
  resendApiKey: 're_test-key',
  emailFrom: 'Opna <bookings@example.test>',
  port: 3001,
  corsOrigins: ['http://localhost:5173'],
};

describe('Resend HTTP sender', () => {
  it('uses Resend HTTP API with the configured sender and backend-only key', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const send = createResendEmailSender(config, request as unknown as typeof fetch);

    await send(email);

    expect(request).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.emailFrom, ...email }),
    }));
  });

  it('does not include the provider response body in delivery errors', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'private provider response' });
    const send = createResendEmailSender(config, request as unknown as typeof fetch);

    const error = await send(email).then(() => null, (reason: Error) => reason);
    expect(error?.message).toBe('Resend returned HTTP 422.');
    expect(error?.message).not.toContain('private provider response');
  });
});
