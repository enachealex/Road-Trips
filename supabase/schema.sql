-- Roadbook database schema for Supabase.
--
-- Run the whole file against the Supabase "postgres" database (see docs/SETUP.md).
-- It is safe to run again after pulling an updated version.
--
-- Access model: "anyone with the link can edit". Each trip has an unguessable slug that
-- appears in its share link. The data lives in its own "roadbook" schema, which the
-- public API cannot see at all. Every read and write goes through the API functions at
-- the bottom of this file, each of which requires the slug, so nobody can list or browse
-- trips they were not given a link to. People say who they are by picking their name on
-- the trip (no passwords); that name is recorded on every change and message.
--
-- Everything Roadbook adds is either in the roadbook schema or is one of the API functions
-- in public, so it sits safely beside other apps in the same database. The public tunnel
-- only passes those function names, so a new API function must be added to its config too.
-- To remove Roadbook entirely:
--   drop schema roadbook cascade;
--   drop function public.create_trip(jsonb), public.get_trip(text), public.update_trip(text, jsonb),
--     public.delete_trip(text), public.upsert_event(text, jsonb),
--     public.delete_event(text, uuid, text), public.restore_event(text, uuid, text),
--     public.post_message(text, jsonb), public.get_messages(text, timestamptz),
--     public.delete_message(text, uuid, text);

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
alter table roadbook.trips add column if not exists created_by text not null default '';
alter table roadbook.trips add column if not exists updated_by text not null default '';

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
alter table roadbook.events add column if not exists created_by text not null default '';
create index if not exists events_trip_id_idx on roadbook.events (trip_id, start_date);

-- Who added, changed, deleted or restored what. "changes" lists the fields an edit touched:
-- [{"field": "startTime", "from": "18:30", "to": "19:00"}, ...]
create table if not exists roadbook.activity (
  id        bigint generated always as identity primary key,
  trip_id   uuid not null references roadbook.trips (id) on delete cascade,
  event_id  uuid references roadbook.events (id) on delete set null,
  actor     text not null default '',
  action    text not null check (action in (
              'trip_created', 'trip_updated', 'event_added', 'event_updated', 'event_deleted', 'event_restored')),
  title     text not null default '',
  kind      text,
  changes   jsonb not null default '[]',
  at        timestamptz not null default now()
);
create index if not exists activity_trip_at_idx on roadbook.activity (trip_id, at desc);

-- The trip's group chat. A message can point at an event ("about the hotel").
create table if not exists roadbook.messages (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references roadbook.trips (id) on delete cascade,
  author      text not null check (char_length(author) between 1 and 60),
  body        text not null check (char_length(body) between 1 and 4000),
  event_id    uuid references roadbook.events (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists messages_trip_created_idx on roadbook.messages (trip_id, created_at);

-- Belt and braces: the schema is already invisible to the API roles, but in case a grant
-- ever slips, RLS with no policies still denies everything.
alter table roadbook.trips enable row level security;
alter table roadbook.events enable row level security;
alter table roadbook.activity enable row level security;
alter table roadbook.messages enable row level security;
revoke all on roadbook.trips, roadbook.events, roadbook.activity, roadbook.messages from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function roadbook.clean_actor(p text)
returns text language sql immutable set search_path = '' as $$
  select left(trim(coalesce(p, '')), 60);
$$;

create or replace function roadbook.trip_json(t roadbook.trips)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'slug',      t.slug,
    'name',      t.name,
    'startDate', t.start_date,
    'endDate',   t.end_date,
    'travelers', to_jsonb(t.travelers),
    'notes',     t.notes,
    'createdBy', t.created_by,
    'updatedBy', t.updated_by,
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
    'createdBy',    e.created_by,
    'updatedBy',    e.updated_by,
    'createdAt',    e.created_at,
    'updatedAt',    e.updated_at,
    'deletedAt',    e.deleted_at
  );
$$;

create or replace function roadbook.activity_json(a roadbook.activity)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',      a.id::text,
    'at',      a.at,
    'actor',   a.actor,
    'action',  a.action,
    'eventId', a.event_id,
    'title',   a.title,
    'kind',    a.kind,
    'changes', a.changes
  );
$$;

create or replace function roadbook.message_json(m roadbook.messages)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',        m.id,
    'author',    m.author,
    'body',      case when m.deleted_at is null then m.body else '' end,
    'eventId',   m.event_id,
    'createdAt', m.created_at,
    'deleted',   m.deleted_at is not null
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

-- The fields an event edit changed. Notes are flagged without copying their text.
create or replace function roadbook.event_changes(o roadbook.events, n roadbook.events)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(c order by ord, sub), '[]'::jsonb) from (
    select ord, '' as sub, jsonb_build_object('field', f, 'from', a, 'to', b) as c
    from (values
      (1,  'title',        to_jsonb(o.title),                       to_jsonb(n.title)),
      (2,  'kind',         to_jsonb(o.kind),                        to_jsonb(n.kind)),
      (3,  'startDate',    to_jsonb(o.start_date),                  to_jsonb(n.start_date)),
      (4,  'startTime',    to_jsonb(to_char(o.start_time, 'HH24:MI')), to_jsonb(to_char(n.start_time, 'HH24:MI'))),
      (5,  'endDate',      to_jsonb(o.end_date),                    to_jsonb(n.end_date)),
      (6,  'endTime',      to_jsonb(to_char(o.end_time, 'HH24:MI')),   to_jsonb(to_char(n.end_time, 'HH24:MI'))),
      (7,  'location',     to_jsonb(o.location),                    to_jsonb(n.location)),
      (8,  'address',      to_jsonb(o.address),                     to_jsonb(n.address)),
      (9,  'endLocation',  to_jsonb(o.end_location),                to_jsonb(n.end_location)),
      (10, 'endAddress',   to_jsonb(o.end_address),                 to_jsonb(n.end_address)),
      (11, 'travelers',    to_jsonb(o.travelers),                   to_jsonb(n.travelers)),
      (12, 'confirmation', to_jsonb(o.confirmation),                to_jsonb(n.confirmation)),
      (13, 'phone',        to_jsonb(o.phone),                       to_jsonb(n.phone)),
      (14, 'url',          to_jsonb(o.url),                         to_jsonb(n.url))
    ) v (ord, f, a, b)
    where a is distinct from b
    union all
    select 50, k, jsonb_build_object('field', 'details.' || k, 'from', o.details -> k, 'to', n.details -> k)
    from (select jsonb_object_keys(o.details) as k union select jsonb_object_keys(n.details)) keys
    where (o.details -> k) is distinct from (n.details -> k)
    union all
    select 90, '', jsonb_build_object('field', 'notes', 'from', null, 'to', null)
    where o.notes is distinct from n.notes
  ) s;
$$;

create or replace function roadbook.trip_changes(o roadbook.trips, n roadbook.trips)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(c order by ord), '[]'::jsonb) from (
    select ord, jsonb_build_object('field', f, 'from', a, 'to', b) as c
    from (values
      (1, 'name',      to_jsonb(o.name),       to_jsonb(n.name)),
      (2, 'startDate', to_jsonb(o.start_date), to_jsonb(n.start_date)),
      (3, 'endDate',   to_jsonb(o.end_date),   to_jsonb(n.end_date)),
      (4, 'travelers', to_jsonb(o.travelers),  to_jsonb(n.travelers))
    ) v (ord, f, a, b)
    where a is distinct from b
    union all
    select 90, jsonb_build_object('field', 'notes', 'from', null, 'to', null)
    where o.notes is distinct from n.notes
  ) s;
$$;

create or replace function roadbook.log_activity(
  p_trip uuid, p_event uuid, p_actor text, p_action text, p_title text, p_kind text, p_changes jsonb default '[]'
) returns void language sql set search_path = '' as $$
  insert into roadbook.activity (trip_id, event_id, actor, action, title, kind, changes)
  values (p_trip, p_event, coalesce(p_actor, ''), p_action, coalesce(p_title, ''), p_kind, coalesce(p_changes, '[]'::jsonb));
$$;

revoke execute on all functions in schema roadbook from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public API (called from the app with supabase.rpc)
-- ---------------------------------------------------------------------------

-- Create a trip. p_trip.by is the person creating it. Returns the trip with its new slug.
create or replace function public.create_trip(p_trip jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips;
  v_by text := roadbook.clean_actor(p_trip ->> 'by');
begin
  insert into roadbook.trips (slug, name, start_date, end_date, travelers, notes, created_by, updated_by)
  values (
    substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16),
    trim(p_trip ->> 'name'),
    (p_trip ->> 'startDate')::date,
    (p_trip ->> 'endDate')::date,
    roadbook.text_array(p_trip -> 'travelers'),
    coalesce(p_trip ->> 'notes', ''),
    v_by,
    v_by
  )
  returning * into t;
  perform roadbook.log_activity(t.id, null, v_by, 'trip_created', t.name, null);
  return roadbook.trip_json(t);
end;
$$;

-- Load a trip with its events and recent activity. Null if the slug is unknown or deleted.
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
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(roadbook.activity_json(a) order by a.at desc, a.id desc)
      from (select * from roadbook.activity where trip_id = t.id order by at desc, id desc limit 80) a
    ), '[]'::jsonb)
  );
end;
$$;

-- Update trip details. Keys left out of p_trip keep their current value; p_trip.by is who.
create or replace function public.update_trip(p_slug text, p_trip jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o roadbook.trips := roadbook.find_trip(p_slug);
  t roadbook.trips;
  v_by text := roadbook.clean_actor(p_trip ->> 'by');
  v_changes jsonb;
begin
  update roadbook.trips set
    name       = coalesce(nullif(trim(p_trip ->> 'name'), ''), name),
    start_date = coalesce((p_trip ->> 'startDate')::date, start_date),
    end_date   = coalesce((p_trip ->> 'endDate')::date, end_date),
    travelers  = case when p_trip ? 'travelers' then roadbook.text_array(p_trip -> 'travelers') else travelers end,
    notes      = coalesce(p_trip ->> 'notes', notes),
    updated_by = v_by,
    updated_at = now()
  where id = o.id
  returning * into t;
  v_changes := roadbook.trip_changes(o, t);
  if v_changes <> '[]'::jsonb then
    perform roadbook.log_activity(t.id, null, v_by, 'trip_updated', t.name, null, v_changes);
  end if;
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

-- Create or update an event; p_event.updatedBy is who. Without an "id" a new event is
-- created; with one, that event is updated (and restored if someone had deleted it).
create or replace function public.upsert_event(p_slug text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  v_id uuid := nullif(p_event ->> 'id', '')::uuid;
  v_by text := roadbook.clean_actor(p_event ->> 'updatedBy');
  o roadbook.events;
  e roadbook.events;
  v_changes jsonb;
begin
  if v_id is not null then
    select * into o from roadbook.events where id = v_id and trip_id = t.id;
  end if;

  insert into roadbook.events as cur (
    id, trip_id, kind, title, start_date, start_time, end_date, end_time,
    location, address, end_location, end_address, confirmation, url, phone, notes,
    travelers, details, created_by, updated_by
  )
  values (
    coalesce(v_id, gen_random_uuid()),
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
    v_by,
    v_by
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

  if o.id is null then
    perform roadbook.log_activity(t.id, e.id, v_by, 'event_added', e.title, e.kind);
  else
    v_changes := roadbook.event_changes(o, e);
    if o.deleted_at is not null then
      perform roadbook.log_activity(t.id, e.id, v_by, 'event_restored', e.title, e.kind, v_changes);
    elsif v_changes <> '[]'::jsonb then
      perform roadbook.log_activity(t.id, e.id, v_by, 'event_updated', e.title, e.kind, v_changes);
    end if;
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
  v_by text := roadbook.clean_actor(p_by);
  e roadbook.events;
begin
  update roadbook.events set deleted_at = now(), updated_by = v_by
  where id = p_event_id and trip_id = t.id and deleted_at is null
  returning * into e;
  if found then
    perform roadbook.log_activity(t.id, e.id, v_by, 'event_deleted', e.title, e.kind);
    update roadbook.trips set updated_at = now() where id = t.id;
  end if;
end;
$$;

create or replace function public.restore_event(p_slug text, p_event_id uuid, p_by text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  v_by text := roadbook.clean_actor(p_by);
  e roadbook.events;
begin
  update roadbook.events set deleted_at = null, updated_by = v_by, updated_at = now()
  where id = p_event_id and trip_id = t.id
  returning * into e;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  perform roadbook.log_activity(t.id, e.id, v_by, 'event_restored', e.title, e.kind);
  update roadbook.trips set updated_at = now() where id = t.id;
  return roadbook.event_json(e);
end;
$$;

-- Post to the trip's group chat. p_message: {"by": "Mom", "body": "...", "eventId": optional}.
create or replace function public.post_message(p_slug text, p_message jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  v_by text := roadbook.clean_actor(p_message ->> 'by');
  v_event uuid := nullif(p_message ->> 'eventId', '')::uuid;
  m roadbook.messages;
begin
  if v_by = '' then
    raise exception 'Choose who you are before sending a message' using errcode = '22023';
  end if;
  -- Only link to events that belong to this trip.
  if v_event is not null and not exists (select 1 from roadbook.events where id = v_event and trip_id = t.id) then
    v_event := null;
  end if;
  insert into roadbook.messages (trip_id, author, body, event_id)
  values (t.id, v_by, trim(p_message ->> 'body'), v_event)
  returning * into m;
  return roadbook.message_json(m);
end;
$$;

-- Messages oldest first. With p_after, only newer ones; otherwise the latest 300.
create or replace function public.get_messages(p_slug text, p_after timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
begin
  return coalesce((
    select jsonb_agg(roadbook.message_json(m) order by m.created_at, m.id)
    from (
      select * from roadbook.messages
      where trip_id = t.id and (p_after is null or created_at > p_after)
      order by created_at desc, id desc
      limit 300
    ) m
  ), '[]'::jsonb);
end;
$$;

-- Delete your own message (matched on the name it was sent under).
create or replace function public.delete_message(p_slug text, p_message_id uuid, p_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  m roadbook.messages;
begin
  update roadbook.messages set deleted_at = now()
  where id = p_message_id and trip_id = t.id and deleted_at is null
    and lower(author) = lower(roadbook.clean_actor(p_by))
  returning * into m;
  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  return roadbook.message_json(m);
end;
$$;

grant execute on function public.create_trip(jsonb) to anon, authenticated;
grant execute on function public.get_trip(text) to anon, authenticated;
grant execute on function public.update_trip(text, jsonb) to anon, authenticated;
grant execute on function public.delete_trip(text) to anon, authenticated;
grant execute on function public.upsert_event(text, jsonb) to anon, authenticated;
grant execute on function public.delete_event(text, uuid, text) to anon, authenticated;
grant execute on function public.restore_event(text, uuid, text) to anon, authenticated;
grant execute on function public.post_message(text, jsonb) to anon, authenticated;
grant execute on function public.get_messages(text, timestamptz) to anon, authenticated;
grant execute on function public.delete_message(text, uuid, text) to anon, authenticated;

-- Tell the Supabase API (PostgREST) to pick up new or changed functions straight away.
notify pgrst, 'reload schema';
