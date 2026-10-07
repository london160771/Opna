import type { RequestHandler } from 'express';

export type PublicRateLimitOptions = {
  limit?: number;
  windowMs?: number;
  now?: () => number;
};

export function createPublicRateLimit(options: PublicRateLimitOptions = {}): RequestHandler {
  const limit = options.limit ?? 120;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const attempts = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const currentTime = now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = attempts.get(ip);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      attempts.set(ip, entry);
    }

    if (entry.count >= limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000))));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } });
    }
    entry.count += 1;

    if (attempts.size > 1000) {
      for (const [key, value] of attempts) {
        if (value.resetAt <= currentTime) attempts.delete(key);
      }
    }
    return next();
  };
}
