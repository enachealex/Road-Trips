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
--     public.delete_message(text, uuid, text), public.save_list(text, jsonb),
--     public.save_list_item(text, jsonb), public.save_expense(text, jsonb);

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

-- Costs: the trip's currency, optional households that settle up together, and the
-- payment handles people choose to share ({"Mom": {"venmo": "@mom-s"}}).
alter table roadbook.trips add column if not exists currency text not null default 'USD';
alter table roadbook.trips add column if not exists households jsonb not null default '[]';
alter table roadbook.trips add column if not exists people jsonb not null default '{}';
alter table roadbook.trips drop constraint if exists trips_currency_code;
alter table roadbook.trips add constraint trips_currency_code check (currency ~ '^[A-Z]{3}$');
alter table roadbook.trips drop constraint if exists trips_households_shape;
alter table roadbook.trips add constraint trips_households_shape check (jsonb_typeof(households) = 'array');
alter table roadbook.trips drop constraint if exists trips_people_shape;
alter table roadbook.trips add constraint trips_people_shape check (jsonb_typeof(people) = 'object');

-- Shared checklists: packing, to-dos and any others people add.
create table if not exists roadbook.lists (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references roadbook.trips (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null default 'other' check (kind in ('packing', 'todo', 'other')),
  position    double precision not null default 0,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists lists_trip_idx on roadbook.lists (trip_id, position);

create table if not exists roadbook.list_items (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references roadbook.lists (id) on delete cascade,
  trip_id     uuid not null references roadbook.trips (id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 300),
  assignee    text check (assignee is null or char_length(assignee) between 1 and 60),
  due_date    date,
  done        boolean not null default false,
  done_by     text not null default '',
  done_at     timestamptz,
  position    double precision not null default 0,
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists list_items_list_idx on roadbook.list_items (list_id, position);

-- Shared costs. "split" is the resolved share of each person in cents and always adds up
-- to amount_cents; split_mode/split_input keep what was typed so the form can reopen it.
-- A "payment" is one person paying another back: split holds the single recipient.
create table if not exists roadbook.expenses (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references roadbook.trips (id) on delete cascade,
  kind          text not null default 'expense' check (kind in ('expense', 'payment')),
  description   text not null check (char_length(description) between 1 and 200),
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents < 10000000000),
  category      text not null default 'other' check (category in (
                  'lodging', 'transport', 'fuel', 'food', 'groceries', 'activities', 'shopping', 'other')),
  paid_by       text not null check (char_length(paid_by) between 1 and 60),
  split         jsonb not null check (jsonb_typeof(split) = 'array'),
  split_mode    text not null default 'equal' check (split_mode in ('equal', 'exact', 'shares')),
  split_input   jsonb not null default '{}' check (jsonb_typeof(split_input) = 'object'),
  spent_on      date not null,
  event_id      uuid references roadbook.events (id) on delete set null,
  notes         text not null default '' check (char_length(notes) <= 2000),
  created_by    text not null default '',
  updated_by    text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists expenses_trip_idx on roadbook.expenses (trip_id, spent_on);

-- Activity also covers costs and lists now.
alter table roadbook.activity add column if not exists expense_id uuid references roadbook.expenses (id) on delete set null;
alter table roadbook.activity drop constraint if exists activity_action_check;
alter table roadbook.activity add constraint activity_action_check check (action in (
  'trip_created', 'trip_updated', 'event_added', 'event_updated', 'event_deleted', 'event_restored',
  'expense_added', 'expense_updated', 'expense_deleted', 'payment_recorded', 'list_added', 'list_deleted'));

-- Belt and braces: the schema is already invisible to the API roles, but in case a grant
-- ever slips, RLS with no policies still denies everything.
alter table roadbook.trips enable row level security;
alter table roadbook.events enable row level security;
alter table roadbook.activity enable row level security;
alter table roadbook.messages enable row level security;
alter table roadbook.lists enable row level security;
alter table roadbook.list_items enable row level security;
alter table roadbook.expenses enable row level security;
revoke all on roadbook.trips, roadbook.events, roadbook.activity, roadbook.messages,
  roadbook.lists, roadbook.list_items, roadbook.expenses from public, anon, authenticated;

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
    'currency',  t.currency,
    'households', t.households,
    'people',    t.people,
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
    'expenseId', a.expense_id,
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

create or replace function roadbook.item_json(i roadbook.list_items)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',        i.id,
    'listId',    i.list_id,
    'text',      i.text,
    'assignee',  i.assignee,
    'dueDate',   i.due_date,
    'done',      i.done,
    'doneBy',    i.done_by,
    'doneAt',    i.done_at,
    'position',  i.position,
    'createdBy', i.created_by,
    'createdAt', i.created_at,
    'updatedAt', i.updated_at
  );
$$;

create or replace function roadbook.list_json(l roadbook.lists)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',        l.id,
    'name',      l.name,
    'kind',      l.kind,
    'position',  l.position,
    'createdBy', l.created_by,
    'createdAt', l.created_at,
    'items', coalesce((
      select jsonb_agg(roadbook.item_json(i) order by i.position, i.created_at)
      from roadbook.list_items i where i.list_id = l.id and i.deleted_at is null
    ), '[]'::jsonb)
  );
$$;

create or replace function roadbook.expense_json(x roadbook.expenses)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',          x.id,
    'kind',        x.kind,
    'description', x.description,
    'amountCents', x.amount_cents,
    'category',    x.category,
    'paidBy',      x.paid_by,
    'split',       x.split,
    'splitMode',   x.split_mode,
    'splitInput',  x.split_input,
    'date',        x.spent_on,
    'eventId',     x.event_id,
    'notes',       x.notes,
    'createdBy',   x.created_by,
    'updatedBy',   x.updated_by,
    'createdAt',   x.created_at,
    'updatedAt',   x.updated_at
  );
$$;

-- Households from the app: [{"name": "The Smiths", "members": ["Mom", "Dad"]}], tidied.
create or replace function roadbook.clean_households(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', left(trim(h ->> 'name'), 60),
             'members', to_jsonb(roadbook.text_array(h -> 'members')))), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) h
    where jsonb_typeof(h) = 'object' and trim(coalesce(h ->> 'name', '')) <> ''
  );
end;
$$;

-- An expense's split: [{"name": "Mom", "cents": 1250}, ...]. Rejects anything malformed.
create or replace function roadbook.clean_split(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  out jsonb := '[]'::jsonb;
  s jsonb;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'An expense needs at least one person to split it with' using errcode = '22023';
  end if;
  for s in select * from jsonb_array_elements(p) loop
    if trim(coalesce(s ->> 'name', '')) = '' or coalesce(jsonb_typeof(s -> 'cents'), '') <> 'number' or (s ->> 'cents')::numeric < 0
       or (s ->> 'cents')::numeric <> trunc((s ->> 'cents')::numeric) then
      raise exception 'Each share needs a name and a whole number of cents' using errcode = '22023';
    end if;
    out := out || jsonb_build_array(jsonb_build_object('name', left(trim(s ->> 'name'), 60), 'cents', (s ->> 'cents')::bigint));
  end loop;
  return out;
end;
$$;

create or replace function roadbook.expense_changes(o roadbook.expenses, n roadbook.expenses)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(c order by ord), '[]'::jsonb) from (
    select ord, jsonb_build_object('field', f, 'from', a, 'to', b) as c
    from (values
      (1, 'description', to_jsonb(o.description),  to_jsonb(n.description)),
      (2, 'amountCents', to_jsonb(o.amount_cents), to_jsonb(n.amount_cents)),
      (3, 'category',    to_jsonb(o.category),     to_jsonb(n.category)),
      (4, 'paidBy',      to_jsonb(o.paid_by),      to_jsonb(n.paid_by)),
      (5, 'split',       o.split,                  n.split),
      (6, 'date',        to_jsonb(o.spent_on),     to_jsonb(n.spent_on))
    ) v (ord, f, a, b)
    where a is distinct from b
    union all
    select 90, jsonb_build_object('field', 'notes', 'from', null, 'to', null)
    where o.notes is distinct from n.notes
  ) s;
$$;

create or replace function roadbook.log_expense_activity(
  p_trip uuid, p_expense uuid, p_actor text, p_action text, p_title text, p_changes jsonb
) returns void language sql set search_path = '' as $$
  insert into roadbook.activity (trip_id, expense_id, actor, action, title, changes)
  values (p_trip, p_expense, coalesce(p_actor, ''), p_action, coalesce(p_title, ''), coalesce(p_changes, '[]'::jsonb));
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
      (4, 'travelers', to_jsonb(o.travelers),  to_jsonb(n.travelers)),
      (5, 'currency',  to_jsonb(o.currency),   to_jsonb(n.currency)),
      (6, 'households', o.households,          n.households)
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
  insert into roadbook.trips (slug, name, start_date, end_date, travelers, notes, currency, created_by, updated_by)
  values (
    substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 16),
    trim(p_trip ->> 'name'),
    (p_trip ->> 'startDate')::date,
    (p_trip ->> 'endDate')::date,
    roadbook.text_array(p_trip -> 'travelers'),
    coalesce(p_trip ->> 'notes', ''),
    upper(coalesce(nullif(trim(p_trip ->> 'currency'), ''), 'USD')),
    v_by,
    v_by
  )
  returning * into t;
  -- Every trip starts with a packing list and a to-do list.
  insert into roadbook.lists (trip_id, name, kind, position, created_by)
  values (t.id, 'Packing', 'packing', 1, v_by), (t.id, 'To-do', 'todo', 2, v_by);
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
    ), '[]'::jsonb),
    'lists', coalesce((
      select jsonb_agg(roadbook.list_json(l) order by l.position, l.created_at)
      from roadbook.lists l where l.trip_id = t.id and l.deleted_at is null
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(roadbook.expense_json(x) order by x.spent_on desc, x.created_at desc)
      from roadbook.expenses x where x.trip_id = t.id and x.deleted_at is null
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
    currency   = coalesce(upper(nullif(trim(p_trip ->> 'currency'), '')), currency),
    households = case when p_trip ? 'households' then roadbook.clean_households(p_trip -> 'households') else households end,
    people     = case when jsonb_typeof(p_trip -> 'people') = 'object' then p_trip -> 'people' else people end,
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

-- Create, rename, reorder or delete a list. p_list: {"id"?, "name", "kind"?, "position"?,
-- "deleted"?, "by", "items"?: [{"text", "assignee"?}]}. Items only apply when creating (for
-- example a list copied from another trip). Returns the list, or null once deleted.
create or replace function public.save_list(p_slug text, p_list jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  v_by text := roadbook.clean_actor(p_list ->> 'by');
  v_id uuid := nullif(p_list ->> 'id', '')::uuid;
  l roadbook.lists;
begin
  if v_id is not null then
    select * into l from roadbook.lists where id = v_id and trip_id = t.id and deleted_at is null;
    if not found then
      raise exception 'List not found' using errcode = 'P0002';
    end if;
    if coalesce((p_list ->> 'deleted')::boolean, false) then
      update roadbook.lists set deleted_at = now() where id = l.id;
      perform roadbook.log_activity(t.id, null, v_by, 'list_deleted', l.name, null);
      return null;
    end if;
    update roadbook.lists set
      name     = coalesce(nullif(trim(p_list ->> 'name'), ''), name),
      kind     = coalesce(p_list ->> 'kind', kind),
      position = coalesce((p_list ->> 'position')::double precision, position)
    where id = l.id
    returning * into l;
  else
    insert into roadbook.lists (trip_id, name, kind, position, created_by)
    values (
      t.id,
      trim(p_list ->> 'name'),
      coalesce(p_list ->> 'kind', 'other'),
      coalesce((p_list ->> 'position')::double precision,
               (select coalesce(max(position), 0) + 1 from roadbook.lists where trip_id = t.id)),
      v_by
    )
    returning * into l;
    insert into roadbook.list_items (list_id, trip_id, text, assignee, position, created_by)
    select l.id, t.id, left(trim(i ->> 'text'), 300), nullif(trim(coalesce(i ->> 'assignee', '')), ''), n, v_by
    from jsonb_array_elements(case when jsonb_typeof(p_list -> 'items') = 'array' then p_list -> 'items' else '[]'::jsonb end)
         with ordinality as x (i, n)
    where trim(coalesce(i ->> 'text', '')) <> '';
    perform roadbook.log_activity(t.id, null, v_by, 'list_added', l.name, null);
  end if;
  return roadbook.list_json(l);
end;
$$;

-- Create, edit, check off, move or delete a list item. p_item: {"id"?, "listId", "text",
-- "assignee"?, "dueDate"?, "done"?, "position"?, "deleted"?, "by"}. Checking an item records
-- who checked it. Returns the item, or null once deleted.
create or replace function public.save_list_item(p_slug text, p_item jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  v_by text := roadbook.clean_actor(p_item ->> 'by');
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_list uuid := nullif(p_item ->> 'listId', '')::uuid;
  v_list_ok boolean;
  v_done boolean;
  i roadbook.list_items;
begin
  v_list_ok := v_list is not null
    and exists (select 1 from roadbook.lists where id = v_list and trip_id = t.id and deleted_at is null);

  if v_id is not null then
    select * into i from roadbook.list_items where id = v_id and trip_id = t.id and deleted_at is null;
    if not found then
      raise exception 'Item not found' using errcode = 'P0002';
    end if;
    if coalesce((p_item ->> 'deleted')::boolean, false) then
      update roadbook.list_items set deleted_at = now(), updated_at = now() where id = i.id;
      return null;
    end if;
    v_done := coalesce((p_item ->> 'done')::boolean, i.done);
    update roadbook.list_items set
      text     = coalesce(nullif(trim(p_item ->> 'text'), ''), text),
      assignee = case when p_item ? 'assignee' then nullif(trim(coalesce(p_item ->> 'assignee', '')), '') else assignee end,
      due_date = case when p_item ? 'dueDate' then nullif(p_item ->> 'dueDate', '')::date else due_date end,
      position = coalesce((p_item ->> 'position')::double precision, position),
      list_id  = case when v_list_ok then v_list else list_id end,
      done     = v_done,
      done_by  = case when v_done = i.done then done_by when v_done then v_by else '' end,
      done_at  = case when v_done = i.done then done_at when v_done then now() else null end,
      updated_at = now()
    where id = i.id
    returning * into i;
  else
    if not v_list_ok then
      raise exception 'List not found' using errcode = 'P0002';
    end if;
    v_done := coalesce((p_item ->> 'done')::boolean, false);
    insert into roadbook.list_items (list_id, trip_id, text, assignee, due_date, position, done, done_by, done_at, created_by)
    values (
      v_list,
      t.id,
      trim(p_item ->> 'text'),
      nullif(trim(coalesce(p_item ->> 'assignee', '')), ''),
      nullif(p_item ->> 'dueDate', '')::date,
      coalesce((p_item ->> 'position')::double precision,
               (select coalesce(max(position), 0) + 1 from roadbook.list_items where list_id = v_list)),
      v_done,
      case when v_done then v_by else '' end,
      case when v_done then now() else null end,
      v_by
    )
    returning * into i;
  end if;
  return roadbook.item_json(i);
end;
$$;

-- Create, edit or delete an expense or a payment between two people. p_expense: {"id"?,
-- "kind", "description", "amountCents", "category", "paidBy", "split": [{"name","cents"}],
-- "splitMode", "splitInput", "date", "eventId"?, "notes"?, "deleted"?, "by"}.
-- The split must add up to the amount. Returns the expense, or null once deleted.
create or replace function public.save_expense(p_slug text, p_expense jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t roadbook.trips := roadbook.find_trip(p_slug);
  v_by text := roadbook.clean_actor(p_expense ->> 'by');
  v_id uuid := nullif(p_expense ->> 'id', '')::uuid;
  v_kind text := coalesce(p_expense ->> 'kind', 'expense');
  v_event uuid := nullif(p_expense ->> 'eventId', '')::uuid;
  v_amount bigint;
  v_split jsonb;
  v_changes jsonb;
  o roadbook.expenses;
  x roadbook.expenses;
begin
  if v_id is not null then
    select * into o from roadbook.expenses where id = v_id and trip_id = t.id and deleted_at is null;
    if not found then
      raise exception 'Expense not found' using errcode = 'P0002';
    end if;
    if coalesce((p_expense ->> 'deleted')::boolean, false) then
      update roadbook.expenses set deleted_at = now(), updated_by = v_by, updated_at = now() where id = o.id;
      perform roadbook.log_expense_activity(t.id, o.id, v_by, 'expense_deleted', o.description,
        jsonb_build_array(jsonb_build_object('field', 'amountCents', 'from', o.amount_cents, 'to', null)));
      return null;
    end if;
  end if;

  v_amount := (p_expense ->> 'amountCents')::bigint;
  v_split := roadbook.clean_split(p_expense -> 'split');
  if (select coalesce(sum((s ->> 'cents')::bigint), 0) from jsonb_array_elements(v_split) s) <> v_amount then
    raise exception 'The shares must add up to the total' using errcode = '22023';
  end if;
  if v_kind = 'payment' and (jsonb_array_length(v_split) <> 1
      or lower(v_split -> 0 ->> 'name') = lower(trim(coalesce(p_expense ->> 'paidBy', '')))) then
    raise exception 'A payment goes from one person to one other person' using errcode = '22023';
  end if;
  if v_event is not null and not exists (select 1 from roadbook.events where id = v_event and trip_id = t.id) then
    v_event := null;
  end if;

  if o.id is null then
    insert into roadbook.expenses (
      trip_id, kind, description, amount_cents, category, paid_by, split, split_mode, split_input,
      spent_on, event_id, notes, created_by, updated_by
    )
    values (
      t.id, v_kind, trim(p_expense ->> 'description'), v_amount, coalesce(p_expense ->> 'category', 'other'),
      trim(p_expense ->> 'paidBy'), v_split, coalesce(p_expense ->> 'splitMode', 'equal'),
      case when jsonb_typeof(p_expense -> 'splitInput') = 'object' then p_expense -> 'splitInput' else '{}'::jsonb end,
      coalesce(nullif(p_expense ->> 'date', '')::date, current_date), v_event, coalesce(p_expense ->> 'notes', ''),
      v_by, v_by
    )
    returning * into x;
    perform roadbook.log_expense_activity(
      t.id, x.id, v_by,
      case when v_kind = 'payment' then 'payment_recorded' else 'expense_added' end,
      case when v_kind = 'payment' then x.paid_by || ' → ' || (x.split -> 0 ->> 'name') else x.description end,
      jsonb_build_array(jsonb_build_object('field', 'amountCents', 'from', null, 'to', x.amount_cents)));
  else
    update roadbook.expenses set
      kind         = v_kind,
      description  = trim(p_expense ->> 'description'),
      amount_cents = v_amount,
      category     = coalesce(p_expense ->> 'category', category),
      paid_by      = trim(p_expense ->> 'paidBy'),
      split        = v_split,
      split_mode   = coalesce(p_expense ->> 'splitMode', split_mode),
      split_input  = case when jsonb_typeof(p_expense -> 'splitInput') = 'object' then p_expense -> 'splitInput' else split_input end,
      spent_on     = coalesce(nullif(p_expense ->> 'date', '')::date, spent_on),
      event_id     = v_event,
      notes        = coalesce(p_expense ->> 'notes', notes),
      updated_by   = v_by,
      updated_at   = now()
    where id = o.id
    returning * into x;
    v_changes := roadbook.expense_changes(o, x);
    if v_changes <> '[]'::jsonb then
      perform roadbook.log_expense_activity(t.id, x.id, v_by, 'expense_updated', x.description, v_changes);
    end if;
  end if;
  return roadbook.expense_json(x);
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
grant execute on function public.save_list(text, jsonb) to anon, authenticated;
grant execute on function public.save_list_item(text, jsonb) to anon, authenticated;
grant execute on function public.save_expense(text, jsonb) to anon, authenticated;

-- Tell the Supabase API (PostgREST) to pick up new or changed functions straight away.
notify pgrst, 'reload schema';
