# Opna

Opna is a two-sided booking MVP. Owners authenticate and manage one business; customers will book through a known business link without creating an account.

## Phase 0 status

This repository currently contains the frontend/backend foundation, Supabase Auth registration/login/logout, protected owner routes, the first-login setup redirect, the Phase 0 database schema and RLS policies, and basic tests. Business setup, public booking, and dashboard features are intentionally not implemented in this phase.

## Requirements

- Node.js 20.19 or newer, or Node.js 22.12 or newer
- npm 10 or newer
- Docker, for the local Supabase stack

## Local setup

1. Copy `frontend/.env.example` to `frontend/.env` and `backend/.env.example` to `backend/.env`.
2. Run `npm install`.
3. Start local Supabase with `npm run db:start`. Put the local URL and publishable key printed by the CLI in both workspace env files under their documented variable names.
4. Run `npm run db:reset` to apply the migrations to the local database.
5. Run `npm run dev` to start the API at `http://localhost:3001` and the frontend at `http://localhost:5173`.

The frontend loads `frontend/.env`; the backend loads `backend/.env` and falls back to the root `.env` for compatibility. For a hosted Supabase project, configure its Site URL and allowed redirect URLs for the deployed frontend, then apply migrations with the Supabase CLI. Set the backend and frontend environment variables in their respective hosting environments. Never put a Supabase secret/service-role key in a `VITE_` variable; this implementation only needs a publishable key.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Backend | Public key used with a verified owner's bearer token; RLS remains active |
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

## Phase 0 routes

- `/` — owner-focused entry page
- `/register` and `/login` — Supabase Auth flows
- `/app/*` — session-protected owner routes
- `/app/setup` — authenticated first-run destination; business creation is Phase 1
- `GET /api/health` — API health check
- `GET /api/owner/business` — authenticated, RLS-scoped initial setup lookup

Owner API requests verify the Supabase access token on the server and query Postgres using that same token. This means Postgres RLS applies to API reads; no service-role credential is required or included. The database migration also denies the `anon` role all access to owner tables.

## Verification limits

The unit tests run without Supabase credentials. RLS and exclusion constraints are defined in migrations, with a pgTAP test under `supabase/tests/`. Run `npm run db:reset` followed by `npm run db:test` against a local Supabase stack to verify the policies against Postgres. A live registration/session check also requires a configured Supabase project and Auth email settings.
