import cors from 'cors';
import { timingSafeEqual } from 'node:crypto';
import express, { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import { requireOwner } from './auth/requireOwner.js';
import { createUserSupabaseFactory, type UserSupabaseFactory } from './supabase.js';
import { registerOwnerRoutes } from './ownerRoutes.js';
import { registerPublicRoutes } from './publicRoutes.js';
import { createPublicRateLimit, type PublicRateLimitOptions } from './publicRateLimit.js';
import { createPublicSupabaseFactory, type PublicSupabaseFactory } from './supabase.js';

type AppDependencies = {
  config: AppConfig;
  createUserClient?: UserSupabaseFactory;
  createPublicClient?: PublicSupabaseFactory;
  publicRateLimit?: PublicRateLimitOptions;
  publicNow?: () => Date;
};

export function createApp({ config, createUserClient = createUserSupabaseFactory(config), createPublicClient = createPublicSupabaseFactory(config), publicRateLimit, publicNow }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: false,
  }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ data: { status: 'ok' } });
  });

  app.get('/api/keepalive', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const token = config.keepaliveToken;
    const authorization = req.header('authorization') ?? '';
    const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expected = token ? Buffer.from(token) : Buffer.alloc(0);
    const supplied = Buffer.from(suppliedToken);
    const authorized = Boolean(token) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
    if (!authorized) return res.status(token ? 401 : 503).json({ error: {
      code: token ? 'UNAUTHENTICATED' : 'KEEPALIVE_NOT_CONFIGURED',
      message: token ? 'Provide the keepalive token.' : 'The keepalive endpoint is not configured.',
    } });

    const supabase = createPublicClient();
    if (!supabase) return res.status(503).json({ error: { code: 'KEEPALIVE_UNAVAILABLE', message: 'Database activity could not be verified.' } });
    const { error } = await supabase.from('businesses').select('id').limit(1);
    if (error) return res.status(503).json({ error: { code: 'KEEPALIVE_UNAVAILABLE', message: 'Database activity could not be verified.' } });
    return res.json({ data: { status: 'ok' } });
  });

  const publicRouter = Router();
  publicRouter.use(createPublicRateLimit(publicRateLimit));
  registerPublicRoutes(publicRouter, createPublicClient, publicNow);
  app.use('/api/public', publicRouter);

  const ownerRouter = Router();
  ownerRouter.use(requireOwner(createUserClient));
  registerOwnerRoutes(ownerRouter);
  app.use('/api/owner', ownerRouter);

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error && typeof error === 'object' && 'status' in error && error.status === 400) {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Send valid JSON and check the request fields.' } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  };
  app.use(errorHandler);

  return app;
}
