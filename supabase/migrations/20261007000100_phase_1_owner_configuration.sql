set search_path = public, extensions;

create or replace function public.protect_business_identity_and_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception using errcode = '23514', message = 'A business booking slug cannot be changed.';
  end if;

  if new.timezone is distinct from old.timezone
     and exists (select 1 from public.bookings b where b.business_id = old.id) then
    raise exception using errcode = '23514', message = 'Business time zone is locked after the first booking.';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_business_identity_and_timezone() from public, anon, authenticated;

create trigger businesses_protect_identity_and_timezone
  before update on public.businesses
  for each row execute function public.protect_business_identity_and_timezone();

create or replace function public.replace_owner_weekly_availability(p_windows jsonb)
returns setof public.weekly_availability
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  if p_windows is null or pg_catalog.jsonb_typeof(p_windows) <> 'array' then
    raise exception using errcode = '22023', message = 'Weekly availability must be an array.';
  end if;

  select b.id
    into v_business_id
    from public.businesses b
   where b.owner_id = (select auth.uid());

  if v_business_id is null then
    raise exception using errcode = 'P0002', message = 'Owner business does not exist.';
  end if;

  delete from public.weekly_availability wa
   where wa.business_id = v_business_id;

  insert into public.weekly_availability (business_id, weekday, start_local, end_local)
  select
    v_business_id,
    (item.value ->> 'weekday')::smallint,
    (item.value ->> 'startLocal')::time,
    (item.value ->> 'endLocal')::time
  from pg_catalog.jsonb_array_elements(p_windows) as item(value);

  return query
    select wa.*
      from public.weekly_availability wa
     where wa.business_id = v_business_id
     order by wa.weekday;
end;
$$;

revoke all on function public.replace_owner_weekly_availability(jsonb) from public, anon;
grant execute on function public.replace_owner_weekly_availability(jsonb) to authenticated;
