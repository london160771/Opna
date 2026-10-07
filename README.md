# Opna

Opna is a two-sided booking MVP. Owners authenticate and manage one business; customers book through a known business link without creating an account.

## Phase 2 status

This repository contains the frontend/backend foundation, Supabase Auth, protected owner routes, business setup and profile settings, a permanent booking slug, service management, weekly availability, public business lookup and booking, business-timezone slot generation, server-side booking revalidation, the database overlap constraint, and Phase 0/1/2 tests. Booking management and dashboard features are not part of Phase 2.

## Requirements

- Node.js 20.19 or newer, or Node.js 22.12 or newer
- npm 10 or newer
- Docker, for the local Supabase stack

## Local setup

1. Copy `frontend/.env.example` to `frontend/.env` and `backend/.env.example` to `backend/.env`.
2. Run `npm install`.
3. Start local Supabase with `npm run db:start`. Put the local URL and publishable key printed by the CLI in both workspace env files; put the local secret/service-role key in `backend/.env` only.
4. Run `npm run db:reset` to apply the migrations to the local database.
5. Run `npm run dev` to start the API at `http://localhost:3001` and the frontend at `http://localhost:5173`.

The frontend loads `frontend/.env`; the backend loads `backend/.env` and falls back to the root `.env` for compatibility. For a hosted Supabase project, configure its Site URL and allowed redirect URLs for the deployed frontend, then apply migrations with the Supabase CLI. Set the backend and frontend environment variables in their respective hosting environments. `SUPABASE_SECRET_KEY` is required by public business lookup and booking routes. Keep it on the backend and never put it in a `VITE_` variable.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Backend | Public key used with a verified owner's bearer token; RLS remains active |
| `SUPABASE_SECRET_KEY` | Backend only | Secret key for approved public business reads and booking writes; never expose it to the frontend |
| `PORT` | Backend | API port (defaults to `3001`) |
| `CORS_ORIGINS` | Backend | Comma-separated frontend origins allowed to call the API |
| `VITE_SUPABASE_URL` | Frontend | Supabase Auth URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Public Supabase Auth key |
| `VITE_API_URL` | Frontend | API base URL (defaults to `/api`) |

## Commands

- `npm run dev` — run API and frontend
- `npm run typecheck` — typecheck both workspaces
- `npm test` — run frontend and backend unit tests
- `npm run build` — build the API and frontend
- `npm run db:start` — start the local Supabase stack
- `npm run db:reset` — reset the local database and apply migrations
- `npm run db:test` — run the pgTAP RLS/schema checks against the local database

## Owner routes

- `/` — owner-focused entry page
- `/register` and `/login` — Supabase Auth flows
- `/app/*` — session-protected owner routes
- `/app/setup` — first business creation with a permanent booking slug
- `/app` — setup progress for services and availability
- `/app/services` — create, edit, activate, and deactivate services
- `/app/availability` — replace the seven-day weekly schedule
- `/app/settings` — business name, timezone, and stable booking link
- `/book/:slug` — public service, date, time, contact, and confirmation flow
- `GET /api/public/businesses?query=` — bounded known-business lookup
- `GET /api/public/businesses/:slug` — public business and active-service details
- `GET /api/public/businesses/:slug/slots` — available slots in the business timezone
- `POST /api/public/businesses/:slug/bookings` — validated anonymous booking creation
- `GET /api/health` — API health check
- `/api/owner/business`, `/api/owner/services`, `/api/owner/availability` — authenticated, RLS-scoped owner configuration API

Owner API requests verify the Supabase access token on the server and query Postgres using that same token, so Postgres RLS applies to owner reads and writes. Public API routes use explicit response projections and a backend-only secret key to return approved public fields and create validated bookings. The database denies the `anon` role direct access to owner tables and prevents overlapping active booking intervals with an exclusion constraint.

## Verification limits

The unit tests run without Supabase credentials. Schema, RLS, stable-slug/timezone protections, atomic weekly availability, and booking overlap enforcement are defined in migrations, with pgTAP checks under `supabase/tests/`. Run `npm run db:reset` followed by `npm run db:test` against a local Supabase stack to verify the database constraints and policies. The opt-in `backend/test/publicBooking.integration.test.ts` submits competing inserts to verify the overlap constraint and API conflict response; it requires `RUN_LOCAL_DB_INTEGRATION=true`, a configured backend secret key, and a Supabase URL on loopback. It refuses hosted Supabase URLs. Public route smoke tests also require a configured backend secret key.
