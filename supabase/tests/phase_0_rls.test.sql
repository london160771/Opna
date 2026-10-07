begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), now(), now());

insert into public.businesses (id, owner_id, name, slug, timezone)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Owner A Studio', 'owner-a-studio', 'Europe/London'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'Owner B Studio', 'owner-b-studio', 'America/New_York');

insert into public.services (id, business_id, name, duration_minutes)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'A Service', 30),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'B Service', 45);

insert into public.weekly_availability (business_id, weekday, start_local, end_local)
values
  ('10000000-0000-4000-8000-000000000001', 1, '09:00', '17:00'),
  ('10000000-0000-4000-8000-000000000002', 2, '10:00', '18:00');

insert into public.bookings (
  id, business_id, service_id, service_name_snapshot, duration_minutes_snapshot,
  customer_name, customer_email, starts_at, ends_at
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A Service', 30, 'Customer A', 'customer-a@example.test', '2030-01-07T10:00:00Z', '2030-01-07T10:30:00Z'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'B Service', 45, 'Customer B', 'customer-b@example.test', '2030-01-08T11:00:00Z', '2030-01-08T11:45:00Z');

select ok(not has_table_privilege('anon', 'public.businesses', 'select'), 'anon cannot select businesses');
select ok(not has_table_privilege('anon', 'public.services', 'select'), 'anon cannot select services');
select ok(not has_table_privilege('anon', 'public.weekly_availability', 'select'), 'anon cannot select availability');
select ok(not has_table_privilege('anon', 'public.bookings', 'select'), 'anon cannot select bookings');

select ok((select relrowsecurity from pg_class where oid = 'public.businesses'::regclass), 'businesses has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.services'::regclass), 'services has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.weekly_availability'::regclass), 'availability has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.bookings'::regclass), 'bookings has RLS enabled');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

select is((select count(*)::integer from public.businesses), 1, 'owner A sees only their business');
select is((select count(*)::integer from public.services), 1, 'owner A sees only their services');
select is((select count(*)::integer from public.weekly_availability), 1, 'owner A sees only their availability');
select is((select count(*)::integer from public.bookings), 1, 'owner A sees only their bookings');

update public.businesses set name = 'Changed by A'
where id = '10000000-0000-4000-8000-000000000002';
reset role;
select is((select name from public.businesses where id = '10000000-0000-4000-8000-000000000002'), 'Owner B Studio', 'owner A cannot update owner B business');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

select throws_ok(
  $$insert into public.businesses (owner_id, name, slug, timezone)
    values ('00000000-0000-4000-8000-000000000002', 'Spoofed', 'spoofed-business', 'UTC')$$,
  '42501',
  'new row violates row-level security policy for table "businesses"',
  'owner A cannot create a business for owner B'
);

update public.services set name = 'Changed by A'
where id = '20000000-0000-4000-8000-000000000002';
reset role;
select is((select name from public.services where id = '20000000-0000-4000-8000-000000000002'), 'B Service', 'owner A cannot update owner B service');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

delete from public.weekly_availability
where business_id = '10000000-0000-4000-8000-000000000002';
reset role;
select is((select count(*)::integer from public.weekly_availability where business_id = '10000000-0000-4000-8000-000000000002'), 1, 'owner A cannot delete owner B availability');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

update public.bookings set status = 'cancelled'
where id = '30000000-0000-4000-8000-000000000002';
reset role;
select is((select status from public.bookings where id = '30000000-0000-4000-8000-000000000002'), 'confirmed', 'owner A cannot update owner B booking');

select throws_ok(
  $$insert into public.bookings (
      business_id, service_id, service_name_snapshot, duration_minutes_snapshot,
      customer_name, customer_email, starts_at, ends_at
    ) values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'A Service', 30, 'Overlap Customer', 'overlap@example.test',
      '2030-01-07T10:15:00Z', '2030-01-07T10:45:00Z'
    )$$,
  '23P01',
  'conflicting key value violates exclusion constraint "bookings_prevent_overlapping_active_times"',
  'active bookings cannot overlap'
);

select is((
  select count(*)::integer from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and conname = 'bookings_prevent_overlapping_active_times'
    and contype = 'x'
), 1, 'booking overlap exclusion constraint exists');

select * from finish();
rollback;
