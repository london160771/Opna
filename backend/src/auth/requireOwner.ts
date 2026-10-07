import type { NextFunction, Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserSupabaseFactory } from '../supabase.js';

export type OwnerContext = {
  id: string;
  supabase: SupabaseClient;
};

export type OwnerLocals = {
  owner: OwnerContext;
};

function unauthorized(res: Response, message: string) {
  return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message } });
}

function authUnavailable(res: Response) {
  return res.status(503).json({
    error: { code: 'AUTH_UNAVAILABLE', message: 'We could not verify your session. Try again.' },
  });
}

export function requireOwner(createUserClient: UserSupabaseFactory) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.get('authorization');
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match) return unauthorized(res, 'Sign in to access owner routes.');

    try {
      const accessToken = match[1];
      const supabase = createUserClient(accessToken);
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error) {
        if (error.status === 401 || error.status === 403) {
          return unauthorized(res, 'Your session is invalid or expired.');
        }
        return authUnavailable(res);
      }
      if (!data.user) return unauthorized(res, 'Your session is invalid or expired.');

      (res.locals as OwnerLocals).owner = { id: data.user.id, supabase };
      return next();
    } catch {
      return authUnavailable(res);
    }
  };
}
