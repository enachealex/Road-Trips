/// <reference types="node" />
// Runs schema.sql in PGlite (Postgres compiled to WebAssembly) and calls the API
// functions as the public "anon" role, the way the app does through Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
let db: PGlite;

async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T> {
  await db.exec('set role anon');
  try {
    const { rows } = await db.query<Record<string, T>>(sql, params);
    return Object.values(rows[0] ?? {})[0] as T;
  } finally {
    await db.exec('reset role');
  }
}

const json = (v: unknown) => JSON.stringify(v);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;`);
  await db.exec(schema);
  await db.exec(schema); // must be safe to run again
});

describe('schema', () => {
  let slug: string;
  let eventId: string;

  it('creates a trip with a 16-character code and tidied travelers', async () => {
    const trip = await asAnon<any>('select create_trip($1::jsonb)', [
      json({ name: '  Summer ', startDate: '2027-07-01', endDate: '2027-07-14', travelers: ['Alex', 'Mom', ' alex ', ''] }),
    ]);
    expect(trip.name).toBe('Summer');
    expect(trip.slug).toMatch(/^[0-9a-f]{16}$/);
    expect(trip.travelers).toEqual(['Alex', 'Mom']);
    slug = trip.slug;
  });

  it('keeps the data and helpers closed to the public key', async () => {
    await expect(asAnon('select count(*) from roadbook.trips')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select roadbook.find_trip($1)', [slug])).rejects.toThrow(/permission denied/);
    // Nothing of Roadbook's lands in public except the API functions.
    const tables = await asAnon<number>(
      `select count(*)::int from pg_tables where schemaname = 'public' and tablename in ('trips', 'events')`,
    );
    expect(tables).toBe(0);
  });

  it('adds and updates events', async () => {
    const ev = await asAnon<any>('select upsert_event($1, $2::jsonb)', [
      slug,
      json({ kind: 'flight', title: 'AA 100', startDate: '2027-07-01', startTime: '08:30', endTime: '', details: { flightNumber: '100' } }),
    ]);
    expect(ev.startTime).toBe('08:30');
    expect(ev.endTime).toBeNull();
    eventId = ev.id;
    const updated = await asAnon<any>('select upsert_event($1, $2::jsonb)', [slug, json({ ...ev, title: 'AA 101' })]);
    expect(updated.id).toBe(eventId);
    expect(updated.title).toBe('AA 101');
  });

  it('does not let another trip touch this trip’s events', async () => {
    const other = await asAnon<any>('select create_trip($1::jsonb)', [
      json({ name: 'Other', startDate: '2027-01-01', endDate: '2027-01-02' }),
    ]);
    await expect(
      asAnon('select upsert_event($1, $2::jsonb)', [other.slug, json({ id: eventId, kind: 'note', title: 'x', startDate: '2027-01-01' })]),
    ).rejects.toThrow(/Event not found/);
  });

  it('soft-deletes and restores', async () => {
    await asAnon('select delete_event($1, $2, $3)', [slug, eventId, 'Mom']);
    let bundle = await asAnon<any>('select get_trip($1)', [slug]);
    expect(bundle.events).toHaveLength(0);
    expect(bundle.deletedEvents[0].updatedBy).toBe('Mom');
    await asAnon('select restore_event($1, $2, $3)', [slug, eventId, 'Alex']);
    bundle = await asAnon<any>('select get_trip($1)', [slug]);
    expect(bundle.events).toHaveLength(1);
  });

  it('records who did what, with the fields an edit changed', async () => {
    const ev = await asAnon<any>('select upsert_event($1, $2::jsonb)', [
      slug,
      json({
        kind: 'meal', title: 'Dinner', startDate: '2027-07-02', startTime: '18:30',
        details: { party: '5' }, notes: 'Booth', updatedBy: 'Mom',
      }),
    ]);
    expect(ev.createdBy).toBe('Mom');
    const edited = await asAnon<any>('select upsert_event($1, $2::jsonb)', [
      slug,
      json({ ...ev, startTime: '19:00', travelers: ['Alex'], details: { party: '6' }, notes: 'Patio', updatedBy: 'Dad' }),
    ]);
    expect(edited.createdBy).toBe('Mom');
    expect(edited.updatedBy).toBe('Dad');

    // Saving with no changes adds nothing to the log.
    await asAnon('select upsert_event($1, $2::jsonb)', [slug, json({ ...edited, updatedBy: 'Dad' })]);
    await asAnon('select update_trip($1, $2::jsonb)', [slug, json({ name: 'Summer 2027', by: 'Alex' })]);

    const { activity } = await asAnon<any>('select get_trip($1)', [slug]);
    expect(activity.map((a: any) => `${a.actor} ${a.action} ${a.title}`)).toEqual([
      'Alex trip_updated Summer 2027',
      'Dad event_updated Dinner',
      'Mom event_added Dinner',
      'Alex event_restored AA 101',
      'Mom event_deleted AA 101',
      ' event_updated AA 101',
      ' event_added AA 100',
      ' trip_created Summer',
    ]);
    expect(activity[1].changes).toEqual([
      { field: 'startTime', from: '18:30', to: '19:00' },
      { field: 'travelers', from: [], to: ['Alex'] },
      { field: 'details.party', from: '5', to: '6' },
      { field: 'notes', from: null, to: null },
    ]);
    expect(activity[0].changes).toEqual([{ field: 'name', from: 'Summer', to: 'Summer 2027' }]);
    expect(activity[1].eventId).toBe(ev.id);
  });

  it('runs the group chat', async () => {
    const ev = (await asAnon<any>('select get_trip($1)', [slug])).events[0];
    const first = await asAnon<any>('select post_message($1, $2::jsonb)', [slug, json({ by: 'Mom', body: ' Hi all! ' })]);
    expect(first).toMatchObject({ author: 'Mom', body: 'Hi all!', eventId: null, deleted: false });
    const about = await asAnon<any>('select post_message($1, $2::jsonb)', [
      slug,
      json({ by: 'Dad', body: 'Is this booked?', eventId: ev.id }),
    ]);
    expect(about.eventId).toBe(ev.id);

    let all = await asAnon<any[]>('select get_messages($1)', [slug]);
    expect(all.map((m) => m.body)).toEqual(['Hi all!', 'Is this booked?']);
    const newer = await asAnon<any[]>('select get_messages($1, $2::timestamptz)', [slug, first.createdAt]);
    expect(newer.map((m) => m.body)).toEqual(['Is this booked?']);

    // Only the author can delete, and the text is gone afterwards.
    await expect(asAnon('select delete_message($1, $2, $3)', [slug, about.id, 'Mom'])).rejects.toThrow(/Message not found/);
    await asAnon('select delete_message($1, $2, $3)', [slug, about.id, 'dad']);
    all = await asAnon<any[]>('select get_messages($1)', [slug]);
    expect(all[1]).toMatchObject({ deleted: true, body: '' });

    await expect(asAnon('select post_message($1, $2::jsonb)', [slug, json({ by: '', body: 'x' })])).rejects.toThrow(
      /Choose who you are/,
    );
    await expect(asAnon('select post_message($1, $2::jsonb)', [slug, json({ by: 'Mom', body: '   ' })])).rejects.toThrow(
      /check constraint/,
    );
    await expect(asAnon('select get_messages($1)', ['nope'])).rejects.toThrow(/Trip not found/);
  });

  it('rejects bad data', async () => {
    await expect(asAnon('select update_trip($1, $2::jsonb)', [slug, json({ endDate: '2027-06-01' })])).rejects.toThrow(
      /trips_date_order/,
    );
    await expect(
      asAnon('select upsert_event($1, $2::jsonb)', [slug, json({ kind: 'spaceship', title: 'x', startDate: '2027-07-01' })]),
    ).rejects.toThrow(/check constraint/);
  });

  it('hides deleted and unknown trips', async () => {
    expect(await asAnon('select get_trip($1)', ['nope'])).toBeNull();
    await asAnon('select delete_trip($1)', [slug]);
    expect(await asAnon('select get_trip($1)', [slug])).toBeNull();
  });
});
