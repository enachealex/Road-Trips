/// <reference types="node" />
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

import { describeActivity, unseenActivity } from './activity';
import type { ActivityEntry, EventInput } from './types';

// A minimal localStorage so the demo-mode store can run under Node.
const memory = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

const entry = (e: Partial<ActivityEntry>): ActivityEntry => ({
  id: '1',
  at: '2027-07-01T10:00:00Z',
  actor: 'Dad',
  action: 'event_updated',
  eventId: 'e1',
  title: 'Dinner',
  kind: 'meal',
  changes: [],
  ...e,
});

describe('describeActivity', () => {
  it('writes a sentence per change', () => {
    const d = describeActivity(
      entry({
        changes: [
          { field: 'startTime', from: '18:30', to: '19:00' },
          { field: 'travelers', from: [], to: ['Alex'] },
          { field: 'confirmation', from: '', to: 'QX7' },
          { field: 'phone', from: '555', to: '' },
          { field: 'notes', from: null, to: null },
        ],
      }),
    );
    expect(d.text).toBe('Dad changed Dinner');
    expect(d.details[0]).toMatch(/^Starts time: 6:30\sPM → 7:00\sPM$/);
    expect(d.details.slice(1)).toEqual(['Who: Everyone → Alex', 'Confirmation #: QX7', 'Phone removed', 'Updated the notes']);
  });

  it('uses the right labels for each kind', () => {
    const flight = describeActivity(
      entry({
        kind: 'flight',
        title: 'AA 100',
        changes: [
          { field: 'endLocation', from: 'SFO', to: 'OAK' },
          { field: 'details.flightNumber', from: '100', to: '101' },
        ],
      }),
    );
    expect(flight.details).toEqual(['To airport: SFO → OAK', 'Flight number: 100 → 101']);
  });

  it('describes trip changes and other actions', () => {
    expect(
      describeActivity(
        entry({
          action: 'trip_updated',
          eventId: null,
          kind: null,
          changes: [{ field: 'travelers', from: ['Mom', 'Leo'], to: ['Mom', 'Grandma'] }],
        }),
      ).details,
    ).toEqual(['Added Grandma · Removed Leo']);
    expect(describeActivity(entry({ action: 'event_added', actor: '' })).text).toBe('Someone added Dinner');
    expect(describeActivity(entry({ action: 'event_deleted' })).text).toBe('Dad deleted Dinner');
  });

  it('shows only other people’s changes since the last look', () => {
    const list = [
      entry({ id: 'a', at: '2027-07-02T10:00:00Z', actor: 'Dad' }),
      entry({ id: 'b', at: '2027-07-02T09:00:00Z', actor: 'mom' }),
      entry({ id: 'c', at: '2027-06-30T10:00:00Z', actor: 'Dad' }),
    ];
    expect(unseenActivity(list, '2027-07-01T00:00:00Z', 'Mom').map((e) => e.id)).toEqual(['a']);
    expect(unseenActivity(list, null, 'Mom')).toEqual([]);
  });
});

describe('demo mode matches the database', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon nologin; create role authenticated nologin;
      grant usage on schema public to anon, authenticated;`);
    await db.exec(readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'));
  });

  const sql = async <T,>(query: string, params: unknown[]) => {
    const { rows } = await db.query<Record<string, T>>(query, params);
    return Object.values(rows[0])[0] as T;
  };

  it('records the same changes for the same edits', async () => {
    const { localStore } = await import('./store/local-store');
    const base: EventInput = {
      kind: 'flight', title: 'AA 100', startDate: '2027-07-01', startTime: '08:30', endDate: null, endTime: null,
      location: 'DFW', address: '', endLocation: 'SFO', endAddress: '', confirmation: '', url: '', phone: '',
      notes: 'Window seats', travelers: [], details: { airline: 'AA', flightNumber: '100' }, updatedBy: 'Mom',
    };
    const edit = (id: string): EventInput => ({
      ...base, id, startTime: '09:00', endDate: '2027-07-01', endTime: '11:15', travelers: ['Leo'],
      confirmation: 'QX7', details: { airline: 'AA', flightNumber: '101', seats: '22A' }, notes: 'Aisle', updatedBy: 'Dad',
    });

    // Demo store
    const localTrip = await localStore.createTrip({ name: 'T', startDate: '2027-07-01', endDate: '2027-07-05', travelers: [], notes: '' }, 'Mom');
    const localEvent = await localStore.saveEvent(localTrip.slug, base);
    await localStore.saveEvent(localTrip.slug, edit(localEvent.id));
    const localChanges = (await localStore.getTrip(localTrip.slug))!.activity![0].changes;

    // Database
    const dbTrip = await sql<any>('select create_trip($1::jsonb)', [JSON.stringify({ name: 'T', startDate: '2027-07-01', endDate: '2027-07-05', by: 'Mom' })]);
    const dbEvent = await sql<any>('select upsert_event($1, $2::jsonb)', [dbTrip.slug, JSON.stringify(base)]);
    await sql('select upsert_event($1, $2::jsonb)', [dbTrip.slug, JSON.stringify(edit(dbEvent.id))]);
    const dbChanges = (await sql<any>('select get_trip($1)', [dbTrip.slug])).activity[0].changes;

    expect(localChanges).toEqual(dbChanges);
    expect(dbChanges.map((c: { field: string }) => c.field)).toEqual([
      'startTime', 'endDate', 'endTime', 'travelers', 'confirmation', 'details.flightNumber', 'details.seats', 'notes',
    ]);
  });
});
