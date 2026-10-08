# Opna — coding agent instructions

## Objective and authority

Build Opna, a lightweight, two-sided booking product. Owners run one business; customers book without an account. Opna is a booking tool, not a marketplace. V1.1 includes transactional booking and cancellation emails. `EMAIL_ENABLED` controls outbound delivery; the current deployment uses `EMAIL_ENABLED=false`, with the Resend implementation preserved for future use. `SPEC.md` defines behavior; `DESIGN.md` defines the interface. These three files are the implementation contract. Follow explicit user changes over these files; otherwise do not expand scope.

## Stack and working rules

- Frontend: React, Vite, TypeScript, Tailwind CSS.
- Backend: Node.js, Express, TypeScript; Supabase Postgres and Supabase Auth.
- Deployment: static frontend plus a Node-capable API host and Supabase, all within free-tier limits. Verify current host limits before choosing providers; do not enable paid services.
- Builder: GPT-6 Luna. Reviewer: Sol High (GPT-6 Sol, high reasoning).
- Implement one phase at a time. Report completed acceptance criteria, validation evidence, and outstanding defects. Do not treat model availability as evidence that a review occurred.
- Keep components and business logic small. Put timezone/slot logic in one tested backend module. The backend owns booking validation; the database owns conflict enforcement.
- Use migrations for schema, constraints, functions, and policies. Keep secrets out of source control and frontend bundles; provide an environment-variable example with placeholders.
- Persist all product data in Supabase. Do not ship mock data or browser-only persistence as working functionality.
- Reuse established patterns and dependencies. Avoid unnecessary abstractions, heavy animation packages, and dependencies that exist only for decoration.
- Resolve routine implementation details within this contract. Escalate genuine scope ambiguity while continuing independent work. Do not add features to solve incidental implementation problems.

## Non-negotiable boundaries

No payments, AI, teams, multiple locations, recurring appointments, rescheduling, customer cancellation, calendar sync, scheduled reminders, marketing email, WhatsApp automation, or complex scheduling. Transactional appointment emails are included in V1.1 and are sent through the existing Resend implementation only when `EMAIL_ENABLED=true`; disabling email does not affect booking or cancellation writes. No customer accounts, marketplace listings, recommendations, reviews, or discovery filters. Weekly availability repeats; individual bookings do not recur.

One owner → one business; one business → one timezone and one simultaneous appointment. Services do not have separate capacity. One availability window per weekday. Confirmed and completed bookings retain their stored appointment times; cancellation frees capacity. Never rely on a pre-insert conflict query alone.

## Build order and exit criteria

| Phase | Deliverable | Exit criteria |
| --- | --- | --- |
| 0 — Foundation/auth/schema | App/API structure, environment setup, Supabase migrations, registration/login/logout, protected owner routes | Owner sessions work; anonymous requests fail on owner endpoints; cross-owner access is denied; uniqueness, foreign keys, RLS, and conflict constraints exist; no secrets reach the client. |
| 1 — Business setup | Business settings, stable slug/link, services, weekly availability | One business per owner is enforced; setup persists; service durations and windows validate on client and server; unfinished setup has a clear next action; existing bookings survive configuration changes. |
| 2 — Booking engine/public flow | Business lookup, `/book/:slug`, slots, booking confirmation, database conflict protection | Full anonymous booking works on mobile/desktop; timezone, horizon, past slots, stale selections, and DST cases pass; two concurrent overlapping requests produce exactly one booking and one conflict response. |
| 3 — Dashboard | Counts, bookings list, booking details, owner status actions | Dashboard uses persisted data; completed/cancelled transitions obey the spec; cancellations release slots; empty/error/loading states work; historical service details remain accurate. |
| 4 — Polish/QA/deploy | Responsive/a11y polish, complete checks, deployment configuration | QA checklist passes; production build succeeds; live auth, deep links, booking race, ownership isolation, and public flow pass on the deployed app. |

## Required review gates

1. **After Phase 2, before Phase 3:** Sol High reviews schema/migrations, authentication and ownership, public-data exposure, timezone handling, slot validation, booking transaction, and concurrency evidence. Fix blocking findings and rerun affected checks before proceeding.
2. **After Phase 4 QA, before final deployment:** Sol High reviews the finished change, scope compliance, public booking UX, accessibility, responsive behavior, security, and deployment readiness. Fix blocking findings before deployment; run production smoke checks afterward.

Record each review's model, reviewed revision/artifact, findings, fixes, and verdict in the work report. If the reviewer cannot run, report the gate as pending; never claim it passed. Reviews are quality checks, not extra feature-planning rounds.

## Verification and handoff

- Test meaningful rules: duration/window validation, local-date horizon, UTC conversion, DST gaps/repeats, occupancy boundaries, and status transitions.
- Run integration checks against migrated Postgres, including actual parallel inserts; mocking the database cannot prove conflict protection.
- Verify owner A cannot read or mutate owner B's business, services, availability, bookings, or dashboard data.
- Run type checks, relevant tests, lint if configured, and production builds. Complete the manual checklist in `SPEC.md`; do not mark untested items as passed.
- Provide setup/migration/deployment instructions and required environment variables as part of the implementation handoff. Distinguish verified behavior from remaining limitations.
