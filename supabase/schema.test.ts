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
