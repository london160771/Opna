begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'phase1-owner-a@example.test', '', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'phase1-owner-b@example.test', '', now(), now(), now());

insert into public.businesses (id, owner_id, name, slug, timezone)
values
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', 'Phase 1 A', 'phase-1-a', 'Europe/London'),
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012', 'Phase 1 B', 'phase-1-b', 'UTC');

insert into public.weekly_availability (business_id, weekday, start_local, end_local)
values
  ('10000000-0000-4000-8000-000000000011', 1, '09:00', '17:00'),
  ('10000000-0000-4000-8000-000000000012', 2, '10:00', '16:00');

insert into public.services (id, business_id, name, duration_minutes)
values
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011', 'Consultation', 30),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000012', 'Other owner service', 45);

insert into public.bookings (
  id, business_id, service_id, service_name_snapshot, duration_minutes_snapshot,
  customer_name, customer_email, starts_at, ends_at
)
values (
  '30000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000011',
  'Consultation', 30, 'Test customer', 'test-customer@example.test',
  '2035-01-01T10:00:00Z', '2035-01-01T10:30:00Z'
);

select ok(not has_function_privilege('anon', 'public.replace_owner_weekly_availability(jsonb)', 'execute'), 'anonymous role cannot replace owner availability');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';

select is((select count(*)::integer from public.businesses), 1, 'owner can see only their business');
select is((select count(*)::integer from public.services), 1, 'owner can see their own service');
select is((select count(*)::integer from public.services where id = '20000000-0000-4000-8000-000000000012'), 0, 'owner cannot see the other business service');
select lives_ok(
  'select * from public.replace_owner_weekly_availability(''[{"weekday":3,"startLocal":"10:00","endLocal":"18:00"},{"weekday":5,"startLocal":"11:00","endLocal":"15:00"}]''::jsonb)',
  'owner can atomically replace their full week'
);
select is((select count(*)::integer from public.weekly_availability), 2, 'owner receives only their two replacement windows');
select is((select count(*)::integer from public.weekly_availability where business_id = '10000000-0000-4000-8000-000000000012'), 0, 'owner cannot see the other business availability');
select throws_ok(
  'update public.businesses set slug = ''changed-slug'' where id = ''10000000-0000-4000-8000-000000000011''',
  '23514',
  'A business booking slug cannot be changed.',
  'owner cannot change a permanent business slug'
);
select throws_ok(
  'update public.businesses set timezone = ''UTC'' where id = ''10000000-0000-4000-8000-000000000011''',
  '23514',
  'Business time zone is locked after the first booking.',
  'timezone changes are blocked after the first booking'
);

reset role;
select is((select count(*)::integer from public.weekly_availability where business_id = '10000000-0000-4000-8000-000000000012'), 1, 'replacement did not change the other owner availability');

select * from finish();
rollback;
