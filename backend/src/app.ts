import cors from 'cors';
import express, { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import { requireOwner } from './auth/requireOwner.js';
import { createUserSupabaseFactory, type UserSupabaseFactory } from './supabase.js';
import { registerOwnerRoutes } from './ownerRoutes.js';

type AppDependencies = {
  config: AppConfig;
  createUserClient?: UserSupabaseFactory;
};

export function createApp({ config, createUserClient = createUserSupabaseFactory(config) }: AppDependencies) {
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
