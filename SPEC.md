# Opna — V1 implementation specification

## Product and scope

Opna gives a small business a shareable booking page and a simple owner dashboard. It has two sides, not a marketplace: owners register/login and manage their business; customers find a known business or open its direct link and book without an account.

Owners manage services, weekly availability, bookings, and settings. Customers choose a service, date, and slot, enter their name and email, then receive an on-screen confirmation. V1.1 adds transactional emails: a booking confirmation to the customer, a new-booking notice to the owner, and a cancellation email to the customer with an optional owner message and a link to book another time. The Resend implementation sends these after successful database writes and is best-effort. `EMAIL_ENABLED` controls outbound delivery: when `false`, the backend skips email requests and delivery-failure logs while booking/cancellation writes and saved cancellation messages continue normally. The current deployment uses `EMAIL_ENABLED=false`; the Resend implementation is preserved for future activation. No reminders or marketing emails are sent.

**Non-goals:** payments, AI, teams, multiple locations, recurring appointments, rescheduling, customer cancellation, calendar sync, reminders, marketing, WhatsApp automation, complex scheduling, customer accounts, and marketplace discovery. No pricing/revenue features or additional customer fields are required.

**Stack:** React + Vite + TypeScript + Tailwind; Node.js + Express + TypeScript; Supabase Postgres + Supabase Auth; free-tier deployment.

**V1 implementation principle:** keep the architecture straightforward and reliable, but do not add production-grade recovery, distributed locking, or infrastructure that is unnecessary for a 1–2 day MVP.

## Core journeys and acceptance criteria

| Journey | Acceptance criteria |
| --- | --- |
| Owner starts | Register/login with email/password; session survives refresh; logout ends access; authenticated owners without a business enter setup. |
| Owner configures | Create one business with name, unique slug, and IANA timezone; create/edit/deactivate services; set open/closed weekdays and one window per open day; save settings with validation. |
| Owner shares | Show the full `/book/:slug` URL and a copy-link action. Slug stays stable after business creation. |
| Customer finds | Homepage offers a plain known-business search. Show only matching business names and booking links; empty query shows no directory. |
| Customer books | Direct URL and search reach the same page; choose active service → date → available time → name/email → review/submit → confirmation, with no account. |
| Owner manages | Dashboard shows upcoming confirmed, completed, and cancelled counts; list bookings and view appointment/contact details; cancel a confirmed booking or mark it completed after its end time. |

Search is a bounded case-insensitive name/slug lookup: minimum two trimmed characters, maximum ten results, deterministic alphabetical order. It has no categories, location filters, featured businesses, or recommendations. A business is bookable when it has at least one active service and one open weekday; empty dates still show no slots.

## Booking rules

- One owner has one business; each business has one timezone and capacity of one. All services share the same occupancy.
- Weekly availability has zero or one window per weekday. Closed days have no window. Times are local, on 15-minute boundaries, with `start < end`; no overnight windows, breaks, or date overrides.
- Service duration is an integer from 15 to 240 minutes, divisible by 15.
- Generate starts every 15 minutes within a day's window. The complete appointment must fit in that window and avoid occupied intervals. Duration means elapsed minutes.
- Horizon: today through the next 29 local calendar dates, inclusive, in the business timezone. Date validation and slot generation use this same rule. Reject starts at or before the server's current time.
- Convert the selected local date/time to UTC on the server with a timezone-aware library using the business timezone. If the library reports an invalid local time, omit/reject that slot. V1 does not need custom DST gap/repeat or offset-transition rules beyond the library's normal behavior.
- Store start/end as `timestamptz`; show the business timezone explicitly throughout booking and confirmation. Do not silently reinterpret the chosen date in the customer's timezone.
- Intervals are half-open: `[start, end)`. A booking ending at 10:00 permits another starting at 10:00.
- Statuses: `confirmed`, `completed`, `cancelled`. Creation always produces `confirmed`. Owner transitions are `confirmed → cancelled` and `confirmed → completed` after the appointment ends. No reopen, undo, reschedule, or customer status actions. Repeating an already-applied action is a no-op.
- Cancellation releases slots. Completed appointments retain historical occupancy and cannot be marked complete early. Existing bookings keep their UTC times and service snapshots after service or availability edits.
- Timezone is editable before the first booking; afterward lock it with a clear explanation to preserve the single-timezone history. Service edits/deactivation do not cancel bookings.
- On submit, revalidate the business, active service, duration, date/horizon, availability, slot alignment, current time, and occupancy. Never trust a client-supplied end time or a previously displayed slot.

## Data model

UUID primary keys and UTC `created_at`/`updated_at` where applicable. Supabase Auth stores credentials; no duplicate password table.

| Table | Required fields and constraints |
| --- | --- |
| `businesses` | `id`, `owner_id` → `auth.users` **unique**, `name`, `slug` **unique**, `timezone`, timestamps. Slug is lowercase ASCII letters/numbers with internal hyphens; reserve it permanently for the business. |
| `services` | `id`, `business_id`, `name`, `duration_minutes`, `is_active`, timestamps. Check duration bounds/divisibility. Deactivate rather than hard-delete referenced services. |
| `weekly_availability` | `business_id`, `weekday` (0=Sunday through 6=Saturday), `start_local`, `end_local`. Composite primary key `(business_id, weekday)`; missing row means closed. Checks enforce weekday, order, and quarter-hour times. |
| `bookings` | `id`, `business_id`, `service_id`, `service_name_snapshot`, `duration_minutes_snapshot`, `customer_name`, `customer_email`, optional `cancellation_message` (maximum 1,000 characters), `starts_at`, `ends_at`, `status`, timestamps. Checks enforce valid status, positive interval, and snapshot duration. |

Enforce that a booking's service belongs to its business with a composite foreign key `(service_id, business_id)` referencing a unique `(id, business_id)` service key. Keep service name/duration snapshots so editing a service does not rewrite appointment history. Do not implement business/account deletion in V1.

### Database conflict contract

Enable `btree_gist` and add an exclusion constraint to `bookings`:

```sql
EXCLUDE USING gist (
  business_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
) WHERE (status IN ('confirmed', 'completed'))
```

This blocks overlaps across services, including two requests arriving close together, and excludes cancelled rows. Translate exclusion violations to HTTP `409 SLOT_UNAVAILABLE`; never return raw database errors.

Keep writes simple in V1. The backend validates ownership and business rules, rereads the current service/availability before creating a booking, and then performs the database write. Owner service, availability, timezone, and status updates can use normal validated backend writes; no custom locking/RPC layer is required for the MVP. The exclusion constraint remains the final protection against overlapping appointments.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Owner-focused homepage: **Create your booking page**, **Login**, and a secondary **Find a business** lookup. |
| `/register`, `/login` | Owner authentication; safe redirects to setup/dashboard. |
| `/book/:slug` | Public service/date/time/contact flow and in-page confirmation. |
| `/app/setup` | First business creation, followed by service/availability setup. |
| `/app` | Owner dashboard, counts, next upcoming booking, shareable link. |
| `/app/services`, `/app/availability` | Owner configuration. |
| `/app/bookings` | Booking list/detail and permitted status actions. |
| `/app/settings` | Business name and allowed timezone changes; display stable slug/link. |

Protect every `/app` page. Frontend route guards improve UX; API authorization is still required. Support direct navigation and refresh on all routes.

## API shape

All paths below are under `/api`. Owner routes require a Supabase bearer token verified server-side; derive owner identity from that token, never request-body IDs. JSON success responses use `{ data }`; errors use `{ error: { code, message, fields? } }`. Dates use `YYYY-MM-DD`; instants use ISO 8601 with an offset/`Z`.

| Method/path | Input → result |
| --- | --- |
| `GET /public/businesses?query=` | Known-business lookup → `{name, slug}` matches only. |
| `GET /public/businesses/:slug` | → Public business name/timezone/slug and active service IDs, names, durations; no owner/contact/booking data. |
| `GET /public/businesses/:slug/slots?serviceId=&date=` | → Valid `{startsAt, endsAt}` slots and business timezone. |
| `POST /public/businesses/:slug/bookings` | `{serviceId, startsAt, customerName, customerEmail}` → booking reference, service snapshot, times, timezone, status. |
| `GET /owner/business` | → Own business or `null` for initial setup. |
| `POST /owner/business` | `{name, slug, timezone}` → Created business; reject a second business. |
| `PATCH /owner/business` | `{name?, timezone?}` → Updated settings, with timezone lock respected. |
| `GET /owner/services` | → Own active/inactive services. |
| `POST /owner/services` | `{name, durationMinutes}` → Service. |
| `PATCH /owner/services/:id` | `{name?, durationMinutes?, isActive?}` → Updated service. |
| `GET /owner/availability` | → Weekly windows. |
| `PUT /owner/availability` | `{windows: [{weekday, startLocal, endLocal}]}` → Replace the saved weekly windows; omitted weekdays are closed. |
| `GET /owner/bookings?cursor=` | → Paginated own bookings, newest appointment first; include fields needed for list/detail. |
| `PATCH /owner/bookings/:id/status` | `{status: "completed" | "cancelled", cancellationMessage?: string}` → Updated booking; message is accepted only for cancellation. |
| `GET /owner/dashboard` | → Upcoming confirmed count (`startsAt > now`), all-time completed/cancelled counts, next upcoming confirmed booking. |

Use `400` for malformed input, `401` for missing/invalid owner sessions, `404` for missing resources or IDs owned by someone else, `409` for conflicts, and `422` for valid-shaped input violating business rules. Use `429` when the basic public rate limit is exceeded and a generic `500` for unexpected errors.

Apply server-side input validation, trimmed names, normalized emails, request-body limits, and a simple per-IP rate-limit middleware for public search/slot/booking endpoints. A lightweight in-process limiter is sufficient for V1; no distributed rate-limit infrastructure is required. Use explicit response projections. Supabase RLS denies anonymous table access and isolates owner data; public APIs run on the server and return only approved fields. The service-role secret never leaves the backend. Logs must omit customer contact data and bearer tokens.

## State and error handling

- Every data screen has loading, empty, success, and recoverable error states. Keep entered form values on errors and show field errors beside fields.
- Unknown slug gets a friendly not-found page. Unconfigured business shows an unavailable state; closed/full dates show “No times available” with an easy date change.
- Changing service clears the selected time and reloads slots; changing date clears the time. Ignore outdated requests so late responses cannot replace the current selection.
- During submit disable duplicate actions and communicate progress. Confirm only after a successful server response; confirmation shows business, service, date/time, timezone, reference, and confirmed status. Send the customer a confirmation email and the owner a new-booking email after the booking insert succeeds. These sends are best-effort and do not affect booking success.
- On owner cancellation, save the optional cancellation message with the status update, then send the customer a cancellation email with business/service/time details and a link to book another time. Repeated cancellation actions do not send another email.
- On `SLOT_UNAVAILABLE`, retain service/date/contact details, clear the time, refresh slots, and ask for another time. On a horizon/past-slot error, refresh date/slot options.
- If booking submission fails because of a network error, keep the entered details and offer retry. V1 does not implement idempotent lost-response recovery; the database overlap constraint still prevents a second appointment occupying the same time.
- Expired owner session returns to login with a safe local return path. Status actions update only after server success; counts/list refresh together.

## Accessibility and responsive acceptance

Use semantic headings/forms, visible labels, accessible validation, visible focus, keyboard-operable controls, and announced async results. Calendar/date and time controls must work without a pointer; selected, disabled, loading, and error states cannot depend on color alone. Meet WCAG AA contrast, respect reduced motion, and keep tap targets at least 44×44 CSS pixels.

At 360px wide there is no page-level horizontal overflow. Public booking stays readable and easy to complete on phones; desktop may use a business summary beside the booking panel. Dashboard navigation collapses accessibly; booking tables become readable cards on small screens. Check 360px, 768px, and 1280px widths, plus 200% zoom.

## QA checklist

- [ ] Register/login/logout/session refresh, setup redirect, expired session, and production auth configuration work.
- [ ] Second-business creation and cross-owner reads/writes fail; anonymous access to private tables/endpoints fails.
- [ ] Slug uniqueness, service bounds (15/240 valid; 0/14/241 invalid), closed days, duplicate weekdays, invalid/overnight windows validate.
- [ ] Search finds known names/slugs, limits results, and exposes no private data; direct links and unknown/unconfigured businesses work.
- [ ] Full customer flow works without auth on keyboard, mobile, and desktop; correct timezone appears throughout.
- [ ] Business-local date handling, today/+29/+30 days, past starts, and timezone conversion behave correctly with a controllable clock.
- [ ] Slot duration fits the window; touching intervals succeed; overlapping services conflict; cancelled bookings release capacity.
- [ ] One overlap-race test proves two competing booking requests cannot both succeed: one booking is created and the other receives `409 SLOT_UNAVAILABLE`.
- [ ] Submit revalidation rejects a stale slot after another booking or a relevant configuration change.
- [ ] Service edits/deactivation and availability edits preserve existing bookings; timezone locks after the first booking.
- [ ] Status transitions, early completion rejection, repeated actions, historical snapshots, and dashboard counts are correct.
- [ ] Loading/empty/network/validation/conflict states preserve appropriate input and announce updates; late slot responses are ignored.
- [ ] Focus, contrast, reduced motion, tap targets, 200% zoom, narrow layouts, and long names are checked.
- [ ] Type checks, meaningful unit/integration tests, production builds, and both Sol High review gates pass.
- [ ] Free-tier deployment handles SPA refresh, auth redirects, HTTPS API access, configured CORS, secrets, migrations, and live booking smoke checks.
