-- Roadbook database schema for Supabase.
--
-- Run the whole file against the Supabase "postgres" database (see docs/SETUP.md).
-- It is safe to run again after pulling an updated version.
--
-- Access model: "anyone with the link can edit". Each trip has an unguessable slug that
-- appears in its share link. The data lives in its own "roadbook" schema, which the
-- public API cannot see at all. Every read and write goes through the seven functions at
-- the bottom of this file, each of which requires the slug, so nobody can list or browse
-- trips they were not given a link to.
--
-- Everything Roadbook adds is either in the roadbook schema or is one of those seven
-- functions in public, so it sits safely beside other apps in the same database.
-- To remove it entirely:
--   drop schema roadbook cascade;
--   drop function public.create_trip(jsonb), public.get_trip(text), public.update_trip(text, jsonb),
--     public.delete_trip(text), public.upsert_event(text, jsonb),
--     public.delete_event(text, uuid, text), public.restore_event(text, uuid, text);

create schema if not exists roadbook;
revoke all on schema roadbook from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists roadbook.trips (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null check (char_length(name) between 1 and 120),
  start_date  date not null,
  end_date    date not null,
  travelers   text[] not null default '{}',
  notes       text not null default '' check (char_length(notes) <= 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint trips_date_order check (end_date >= start_date),
  constraint trips_max_length check (end_date - start_date <= 366)
);

create table if not exists roadbook.events (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references roadbook.trips (id) on delete cascade,
  kind          text not null check (kind in (
                  'flight', 'drive', 'train', 'bus', 'ferry', 'car_rental',
                  'transit', 'lodging', 'activity', 'meal', 'note')),
  title         text not null check (char_length(title) between 1 and 200),
  start_date    date not null,
  start_time    time,
  end_date      date,
  end_time      time,
  location      text not null default '',
  address       text not null default '',
  end_location  text not null default '',
  end_address   text not null default '',
  confirmation  text not null default '',
  url           text not null default '',
  phone         text not null default '',
  notes         text not null default '' check (char_length(notes) <= 20000),
  travelers     text[] not null default '{}',
  details       jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  updated_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint events_date_order check (end_date is null or end_date >= start_date)
);

create index if not exists events_trip_id_idx on roadbook.events (trip_id, start_date);

-- Belt and braces: the schema is already invisible to the API roles, but in case a grant
-- ever slips, RLS with no policies still denies everything.
alter table roadbook.trips enable row level security;
alter table roadbook.events enable row level security;
revoke all on roadbook.trips, roadbook.events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function roadbook.trip_json(t roadbook.trips)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'slug',      t.slug,
    'name',      t.name,
    'startDate', t.start_date,
    'endDate',   t.end_date,
    'travelers', to_jsonb(t.travelers),
    'notes',     t.notes,
    'createdAt', t.created_at,
    'updatedAt', t.updated_at
  );
$$;

create or replace function roadbook.event_json(e roadbook.events)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',           e.id,
    'kind',         e.kind,
    'title',        e.title,
    'startDate',    e.start_date,
    'startTime',    to_char(e.start_time, 'HH24:MI'),
    'endDate',      e.end_date,
    'endTime',      to_char(e.end_time, 'HH24:MI'),
    'location',     e.location,
    'address',      e.address,
    'endLocation',  e.end_location,
    'endAddress',   e.end_address,
    'confirmation', e.confirmation,
    'url',          e.url,
    'phone',        e.phone,
    'notes',        e.notes,
    'travelers',    to_jsonb(e.travelers),
    'details',      e.details,
    'updatedBy',    e.updated_by,
    'createdAt',    e.created_at,
    'updatedAt',    e.updated_at,
    'deletedAt',    e.deleted_at
  );
$$;

create or replace function roadbook.find_trip(p_slug text)
returns roadbook.trips language plpgsql stable set search_path = '' as $$
declare
  t roadbook.trips;
begin
  select * into t from roadbook.trips where slug = p_slug and deleted_at is null;
  if not found then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;
  return t;
end;
$$;

-- JSON array -> trimmed, de-duplicated (case-insensitive) text[] in the original order.
create or replace function roadbook.text_array(p jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(
    array(
      select v from (
        select distinct on (lower(trim(x))) trim(x) as v, i
        from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
             with ordinality as a (x, i)
        where trim(x) <> ''
        order by lower(trim(x)), i
      ) d
      order by i
    ),
    '{}'
  );
$$;

revoke execute on function roadbook.trip_json(roadbook.trips) from public, anon, authenticated;
revoke execute on function roadbook.event_json(roadbook.events) from public, anon, authenticated;
revoke execute on function roadbook.find_trip(text) from public, anon, authenticated;
revoke execute on function roadbook.text_array(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public API (called from the app with supabase.rpc)
-- ---------------------------------------------------------------------------

-- Create a trip. Returns the trip, including the new slug for the share link.
create or replace function public.create_trip(p_trip jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips;
begin
  insert into roadbook.trips (slug, name, start_date, end_date, travelers, notes)
  values (
    substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16),
    trim(p_trip ->> 'name'),
    (p_trip ->> 'startDate')::date,
    (p_trip ->> 'endDate')::date,
    roadbook.text_array(p_trip -> 'travelers'),
    coalesce(p_trip ->> 'notes', '')
  )
  returning * into t;
  return roadbook.trip_json(t);
end;
$$;

-- Load a trip with all its events. Returns null if the slug is unknown or the trip was deleted.
create or replace function public.get_trip(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t roadbook.trips;
begin
  select * into t from roadbook.trips where slug = p_slug and deleted_at is null;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'trip', roadbook.trip_json(t),
    'events', coalesce((
      select jsonb_agg(roadbook.event_json(e) order by e.start_date, e.start_time nulls first, e.created_at)
      from roadbook.events e where e.trip_id = t.id and e.deleted_at is null
    ), '[]'::jsonb),
    'deletedEvents', coalesce((
      select jsonb_agg(roadbook.event_json(e) order by e.deleted_at desc)
      from roadbook.events e
      where e.trip_id = t.id and e.deleted_at > now() - interval '30 days'
    ), '[]'::jsonb)
  );
end;
$$;

-- Update trip details. Keys left out of p_trip keep their current value.
create or replace function public.update_trip(p_slug text, p_trip jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
begin
  update roadbook.trips set
    name       = coalesce(nullif(trim(p_trip ->> 'name'), ''), name),
    start_date = coalesce((p_trip ->> 'startDate')::date, start_date),
    end_date   = coalesce((p_trip ->> 'endDate')::date, end_date),
    travelers  = case when p_trip ? 'travelers' then roadbook.text_array(p_trip -> 'travelers') else travelers end,
    notes      = coalesce(p_trip ->> 'notes', notes),
    updated_at = now()
  where id = t.id
  returning * into t;
  return roadbook.trip_json(t);
end;
$$;

-- Soft-delete a trip. Its link stops working; the rows stay so it can be recovered by hand.
create or replace function public.delete_trip(p_slug text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
begin
  update roadbook.trips set deleted_at = now() where id = t.id;
end;
$$;

-- Create or update an event. Without an "id" a new event is created; with one, that
-- event is updated (and restored if someone else had deleted it in the meantime).
create or replace function public.upsert_event(p_slug text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  e roadbook.events;
begin
  insert into roadbook.events as cur (
    id, trip_id, kind, title, start_date, start_time, end_date, end_time,
    location, address, end_location, end_address, confirmation, url, phone, notes,
    travelers, details, updated_by
  )
  values (
    coalesce(nullif(p_event ->> 'id', '')::uuid, gen_random_uuid()),
    t.id,
    p_event ->> 'kind',
    trim(p_event ->> 'title'),
    (p_event ->> 'startDate')::date,
    nullif(p_event ->> 'startTime', '')::time,
    nullif(p_event ->> 'endDate', '')::date,
    nullif(p_event ->> 'endTime', '')::time,
    coalesce(p_event ->> 'location', ''),
    coalesce(p_event ->> 'address', ''),
    coalesce(p_event ->> 'endLocation', ''),
    coalesce(p_event ->> 'endAddress', ''),
    coalesce(p_event ->> 'confirmation', ''),
    coalesce(p_event ->> 'url', ''),
    coalesce(p_event ->> 'phone', ''),
    coalesce(p_event ->> 'notes', ''),
    roadbook.text_array(p_event -> 'travelers'),
    case when jsonb_typeof(p_event -> 'details') = 'object' then p_event -> 'details' else '{}'::jsonb end,
    coalesce(p_event ->> 'updatedBy', '')
  )
  on conflict (id) do update set
    kind         = excluded.kind,
    title        = excluded.title,
    start_date   = excluded.start_date,
    start_time   = excluded.start_time,
    end_date     = excluded.end_date,
    end_time     = excluded.end_time,
    location     = excluded.location,
    address      = excluded.address,
    end_location = excluded.end_location,
    end_address  = excluded.end_address,
    confirmation = excluded.confirmation,
    url          = excluded.url,
    phone        = excluded.phone,
    notes        = excluded.notes,
    travelers    = excluded.travelers,
    details      = excluded.details,
    updated_by   = excluded.updated_by,
    updated_at   = now(),
    deleted_at   = null
  where cur.trip_id = excluded.trip_id
  returning * into e;

  if e.id is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  update roadbook.trips set updated_at = now() where id = t.id;
  return roadbook.event_json(e);
end;
$$;

-- Soft-delete an event. It shows under "Recently deleted" for 30 days and can be restored.
create or replace function public.delete_event(p_slug text, p_event_id uuid, p_by text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
begin
  update roadbook.events set deleted_at = now(), updated_by = coalesce(p_by, '')
  where id = p_event_id and trip_id = t.id and deleted_at is null;
  update roadbook.trips set updated_at = now() where id = t.id;
end;
$$;

create or replace function public.restore_event(p_slug text, p_event_id uuid, p_by text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  e roadbook.events;
begin
  update roadbook.events set deleted_at = null, updated_by = coalesce(p_by, ''), updated_at = now()
  where id = p_event_id and trip_id = t.id
  returning * into e;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  update roadbook.trips set updated_at = now() where id = t.id;
  return roadbook.event_json(e);
end;
$$;

grant execute on function public.create_trip(jsonb) to anon, authenticated;
grant execute on function public.get_trip(text) to anon, authenticated;
grant execute on function public.update_trip(text, jsonb) to anon, authenticated;
grant execute on function public.delete_trip(text) to anon, authenticated;
grant execute on function public.upsert_event(text, jsonb) to anon, authenticated;
grant execute on function public.delete_event(text, uuid, text) to anon, authenticated;
grant execute on function public.restore_event(text, uuid, text) to anon, authenticated;

-- Tell the Supabase API (PostgREST) to pick up new or changed functions straight away.
notify pgrst, 'reload schema';
