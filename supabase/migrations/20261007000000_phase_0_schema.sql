set search_path = public, extensions;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone text not null check (char_length(btrim(timezone)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  duration_minutes integer not null check (
    duration_minutes between 15 and 240 and duration_minutes % 15 = 0
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_id_business_id_key unique (id, business_id)
);

create index services_business_id_idx on public.services (business_id);

create table public.weekly_availability (
  business_id uuid not null references public.businesses (id) on delete restrict,
  weekday smallint not null check (weekday between 0 and 6),
  start_local time without time zone not null,
  end_local time without time zone not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, weekday),
  check (start_local < end_local),
  check (
    extract(minute from start_local)::integer % 15 = 0
    and extract(second from start_local) = 0
    and extract(minute from end_local)::integer % 15 = 0
    and extract(second from end_local) = 0
  )
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  service_id uuid not null,
  service_name_snapshot text not null check (char_length(btrim(service_name_snapshot)) between 1 and 120),
  duration_minutes_snapshot integer not null check (
    duration_minutes_snapshot between 15 and 240
    and duration_minutes_snapshot % 15 = 0
  ),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 120),
  customer_email text not null check (
    char_length(btrim(customer_email)) between 3 and 254
    and customer_email = lower(btrim(customer_email))
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at = starts_at + make_interval(mins => duration_minutes_snapshot)),
  constraint bookings_service_business_fkey
    foreign key (service_id, business_id)
    references public.services (id, business_id)
    on delete restrict
);

create index bookings_business_starts_at_idx on public.bookings (business_id, starts_at desc);

alter table public.bookings
  add constraint bookings_prevent_overlapping_active_times
  exclude using gist (
    business_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('confirmed', 'completed'));

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create trigger weekly_availability_set_updated_at
  before update on public.weekly_availability
  for each row execute function public.set_updated_at();

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.weekly_availability enable row level security;
alter table public.bookings enable row level security;

revoke all privileges on table
  public.businesses,
  public.services,
  public.weekly_availability,
  public.bookings
from public, anon, authenticated;

grant select, insert, update on public.businesses to authenticated;
grant select, insert, update on public.services to authenticated;
grant select, insert, update, delete on public.weekly_availability to authenticated;
grant select, update on public.bookings to authenticated;

create policy businesses_select_own
  on public.businesses for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy businesses_insert_own
  on public.businesses for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy businesses_update_own
  on public.businesses for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy services_select_own
  on public.services for select to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = services.business_id and b.owner_id = (select auth.uid())
  ));

create policy services_insert_own
  on public.services for insert to authenticated
  with check (exists (
    select 1 from public.businesses b
    where b.id = services.business_id and b.owner_id = (select auth.uid())
  ));

create policy services_update_own
  on public.services for update to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = services.business_id and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.businesses b
    where b.id = services.business_id and b.owner_id = (select auth.uid())
  ));

create policy availability_select_own
  on public.weekly_availability for select to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = weekly_availability.business_id and b.owner_id = (select auth.uid())
  ));

create policy availability_insert_own
  on public.weekly_availability for insert to authenticated
  with check (exists (
    select 1 from public.businesses b
    where b.id = weekly_availability.business_id and b.owner_id = (select auth.uid())
  ));

create policy availability_update_own
  on public.weekly_availability for update to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = weekly_availability.business_id and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.businesses b
    where b.id = weekly_availability.business_id and b.owner_id = (select auth.uid())
  ));

create policy availability_delete_own
  on public.weekly_availability for delete to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = weekly_availability.business_id and b.owner_id = (select auth.uid())
  ));

create policy bookings_select_own
  on public.bookings for select to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = bookings.business_id and b.owner_id = (select auth.uid())
  ));

create policy bookings_update_own
  on public.bookings for update to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = bookings.business_id and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.businesses b
    where b.id = bookings.business_id and b.owner_id = (select auth.uid())
  ));
