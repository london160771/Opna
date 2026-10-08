# Opna

Opna is a two-sided booking MVP. Owners authenticate and manage one business; customers book through a known business link without creating an account.

## Phase 4 status

The V1 booking MVP includes owner authentication and setup, services and weekly availability, anonymous public booking, the timezone-aware booking engine, owner dashboard and booking management, responsive states, and a Netlify static-plus-functions deployment configuration. Supabase stores all product data.

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

The frontend loads `frontend/.env`; the backend loads `backend/.env` and falls back to the root `.env` for compatibility. Before deployment, authenticate the Supabase CLI with `npx supabase login`, then apply the migrations to the hosted project from the repository root with `npx supabase link --project-ref <project-ref>` followed by `npx supabase db push`. Configure the Supabase Auth Site URL and allowed redirect URLs for the deployed frontend. Set the backend and frontend environment variables in the Netlify site environment. `SUPABASE_SECRET_KEY` is required by public business lookup, booking, and keepalive routes. Keep it server-side and never put it in a `VITE_` variable.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Backend | Public key used with a verified owner's bearer token; RLS remains active |
| `SUPABASE_SECRET_KEY` | Backend only | Secret key for approved public business reads and booking writes; never expose it to the frontend |
| `EMAIL_ENABLED` | Backend | Enables transactional email when set to `true`; set to `false` to skip all outbound email requests (defaults to `false`) |
| `RESEND_API_KEY` | Backend only | Resend API key for transactional booking and cancellation emails |
| `EMAIL_FROM` | Backend only | Verified sender address used by Resend |
| `APP_URL` | Backend | Frontend origin used for the cancellation email booking link |
| `PORT` | Backend | API port (defaults to `3001`) |
| `CORS_ORIGINS` | Backend | Comma-separated frontend origins allowed to call the API |
| `KEEPALIVE_TOKEN` | Backend only | Bearer token required by the Supabase activity endpoint |
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
- `/app` — owner dashboard, booking counts, next booking, and share link
- `/app/bookings` and `/app/bookings/:id` — responsive booking list and details/status actions
- `/app/services` — create, edit, activate, and deactivate services
- `/app/availability` — replace the seven-day weekly schedule
- `/app/settings` — business name, timezone, and stable booking link
- `/book/:slug` — public service, date, time, contact, and confirmation flow
- `GET /api/public/businesses?query=` — bounded known-business lookup
- `GET /api/public/businesses/:slug` — public business and active-service details
- `GET /api/public/businesses/:slug/slots` — available slots in the business timezone
- `POST /api/public/businesses/:slug/bookings` — validated anonymous booking creation
- `GET /api/health` — API health check
- `GET /api/keepalive` — authenticated, bounded Supabase activity check for GitHub Actions
- `/api/owner/business`, `/api/owner/services`, `/api/owner/availability` — authenticated, RLS-scoped owner configuration API

Owner API requests verify the Supabase access token on the server and query Postgres using that same token, so Postgres RLS applies to owner reads and writes. Public API routes use explicit response projections and a backend-only secret key to return approved public fields and create validated bookings. The database denies the `anon` role direct access to owner tables and prevents overlapping active booking intervals with an exclusion constraint.

Booking confirmation, new-booking owner notification, and owner cancellation emails are implemented with Resend and sent after the corresponding database write succeeds when `EMAIL_ENABLED=true`. The current deployment uses `EMAIL_ENABLED=false`; outbound requests and delivery-failure logs are skipped while bookings, cancellations, and saved cancellation messages continue normally. The Resend implementation is preserved for future use. To enable it, set `EMAIL_ENABLED=true`, configure `RESEND_API_KEY`, a Resend-verified `EMAIL_FROM`, and the public frontend origin in `APP_URL` in `backend/.env` (and in the backend deployment environment). Email delivery is best-effort and does not undo a booking or cancellation. Cancellation messages are saved with the booking and limited to 1,000 characters.

To test the full email flow, apply the latest migrations (`npm run db:reset` locally or `npx supabase db push` for the linked hosted project), set `EMAIL_ENABLED=true` and the three Resend-related backend variables, and restart the API. Create a booking through `/book/:slug`; check the customer inbox for the confirmation and the owner's inbox for the new-booking notice. Then open that booking in the owner dashboard, cancel it with a short message, and check the customer inbox for the cancellation message and “Book another time” link. Use inboxes you control and verify that the sender domain is approved by Resend.

## Verification limits

The unit tests run without Supabase credentials. Schema, RLS, stable-slug/timezone protections, atomic weekly availability, and booking overlap enforcement are defined in migrations, with pgTAP checks under `supabase/tests/`. Run `npm run db:reset` followed by `npm run db:test` against a local Supabase stack to verify the database constraints and policies. The opt-in `backend/test/publicBooking.integration.test.ts` submits competing inserts to verify the overlap constraint and API conflict response; it requires `RUN_LOCAL_DB_INTEGRATION=true`, a configured backend secret key, and a Supabase URL on loopback. It refuses hosted Supabase URLs. Public route smoke tests also require a configured backend secret key.

## Netlify deployment

The root `netlify.toml` builds the static Vite frontend and packages the same Express API as a Netlify Function. It rewrites `/api/*` to the function and all other unknown paths to `index.html`, so direct links such as `/book/:slug` and `/app/bookings/:id` survive refresh. Deploy the repository root as one Netlify site; the Free plan currently has a hard monthly usage limit and pauses sites at that limit, with no automatic charge. Check the live plan limits before launch.

Configure these site environment variables before the production build:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for browser-side Supabase Auth.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` for server-side API calls.
- `EMAIL_ENABLED=false` for the current deployment. To activate transactional email later, use `true` and configure `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_URL` in the backend environment.
- `CORS_ORIGINS` with the exact deployed site origin (for example, `https://your-site.netlify.app`).
- `KEEPALIVE_TOKEN` with a long random value kept in the site environment only.

After deploy, set the Supabase Auth Site URL and allowed redirect URLs to the deployed origin. Add GitHub repository secrets `KEEPALIVE_URL` (the deployed `/api/keepalive` URL) and `KEEPALIVE_TOKEN` (the same value as the Netlify backend variable). `.github/workflows/supabase-keepalive.yml` runs a database query twice daily and can also be started manually. Its secrets and workflow take effect after the workflow is pushed to the default branch. The keepalive is best-effort: GitHub may delay, drop, or disable scheduled runs, and this check cannot guarantee exemption from Supabase inactivity pausing. Monitor Supabase pause warnings and project status. The query checks only one business ID and never returns database rows.
