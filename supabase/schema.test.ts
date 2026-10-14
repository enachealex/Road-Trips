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

  it('starts trips with packing and to-do lists, and keeps items', async () => {
    const trip = await asAnon<any>('select create_trip($1::jsonb)', [
      json({ name: 'Lists', startDate: '2027-08-01', endDate: '2027-08-05', travelers: ['Ana', 'Ben'], by: 'Ana' }),
    ]);
    const s = trip.slug;
    let bundle = await asAnon<any>('select get_trip($1)', [s]);
    expect(bundle.trip.currency).toBe('USD');
    expect(bundle.lists.map((l: any) => [l.name, l.kind])).toEqual([
      ['Packing', 'packing'],
      ['To-do', 'todo'],
    ]);
    const [packing, todo] = bundle.lists;

    const item = await asAnon<any>('select save_list_item($1, $2::jsonb)', [
      s,
      json({ listId: packing.id, text: ' Sunscreen ', assignee: 'Ben', by: 'Ana' }),
    ]);
    expect(item).toMatchObject({ text: 'Sunscreen', assignee: 'Ben', done: false, createdBy: 'Ana', position: 1 });
    const checked = await asAnon<any>('select save_list_item($1, $2::jsonb)', [s, json({ id: item.id, done: true, by: 'Ben' })]);
    expect(checked).toMatchObject({ done: true, doneBy: 'Ben', text: 'Sunscreen', assignee: 'Ben' });
    expect(checked.doneAt).toBeTruthy();
    const unchecked = await asAnon<any>('select save_list_item($1, $2::jsonb)', [
      s,
      json({ id: item.id, done: false, assignee: null, by: 'Ana' }),
    ]);
    expect(unchecked).toMatchObject({ done: false, doneBy: '', doneAt: null, assignee: null });

    const due = await asAnon<any>('select save_list_item($1, $2::jsonb)', [
      s,
      json({ listId: todo.id, text: 'Renew passports', dueDate: '2027-07-01', by: 'Ana' }),
    ]);
    expect(due.dueDate).toBe('2027-07-01');

    const copied = await asAnon<any>('select save_list($1, $2::jsonb)', [
      s,
      json({ name: 'Camping gear', items: [{ text: 'Tent' }, { text: 'Stove', assignee: 'Ben' }, { text: '  ' }], by: 'Ana' }),
    ]);
    expect(copied).toMatchObject({ kind: 'other', position: 3 });
    expect(copied.items.map((i: any) => [i.text, i.assignee])).toEqual([
      ['Tent', null],
      ['Stove', 'Ben'],
    ]);

    // Another trip can't add to or change these lists.
    const other = await asAnon<any>('select create_trip($1::jsonb)', [json({ name: 'X', startDate: '2027-01-01', endDate: '2027-01-02' })]);
    await expect(
      asAnon('select save_list_item($1, $2::jsonb)', [other.slug, json({ listId: packing.id, text: 'Nope' })]),
    ).rejects.toThrow(/List not found/);
    await expect(
      asAnon('select save_list_item($1, $2::jsonb)', [other.slug, json({ id: item.id, done: true })]),
    ).rejects.toThrow(/Item not found/);

    expect(await asAnon('select save_list_item($1, $2::jsonb)', [s, json({ id: item.id, deleted: true })])).toBeNull();
    expect(await asAnon('select save_list($1, $2::jsonb)', [s, json({ id: copied.id, deleted: true, by: 'Ben' })])).toBeNull();
    bundle = await asAnon<any>('select get_trip($1)', [s]);
    expect(bundle.lists.map((l: any) => `${l.name}:${l.items.length}`)).toEqual(['Packing:0', 'To-do:1']);
    expect(bundle.activity.slice(0, 2).map((a: any) => `${a.actor} ${a.action} ${a.title}`)).toEqual([
      'Ben list_deleted Camping gear',
      'Ana list_added Camping gear',
    ]);
  });

  it('records expenses and payments, and checks that shares add up', async () => {
    const trip = await asAnon<any>('select create_trip($1::jsonb)', [
      json({ name: 'Costs', startDate: '2027-08-01', endDate: '2027-08-05', travelers: ['Ana', 'Ben'], currency: 'cad', by: 'Ana' }),
    ]);
    const s = trip.slug;
    expect(trip.currency).toBe('CAD');
    const gas = {
      description: 'Gas', amountCents: 6420, category: 'fuel', paidBy: 'Ana',
      split: [{ name: 'Ana', cents: 3210 }, { name: 'Ben', cents: 3210 }],
      splitMode: 'equal', splitInput: { Ana: 1, Ben: 1 }, date: '2027-08-02', by: 'Ana',
    };
    const saved = await asAnon<any>('select save_expense($1, $2::jsonb)', [s, json(gas)]);
    expect(saved).toMatchObject({ kind: 'expense', amountCents: 6420, paidBy: 'Ana', createdBy: 'Ana', date: '2027-08-02' });

    await expect(
      asAnon('select save_expense($1, $2::jsonb)', [s, json({ ...gas, amountCents: 6400 })]),
    ).rejects.toThrow(/add up/);
    await expect(asAnon('select save_expense($1, $2::jsonb)', [s, json({ ...gas, split: [] })])).rejects.toThrow(
      /at least one person/,
    );
    await expect(
      asAnon('select save_expense($1, $2::jsonb)', [s, json({ ...gas, split: [{ name: 'Ana', cents: 64.2 }], amountCents: 64 })]),
    ).rejects.toThrow(/whole number/);

    await asAnon('select save_expense($1, $2::jsonb)', [
      s,
      json({ ...gas, id: saved.id, amountCents: 7000, split: [{ name: 'Ana', cents: 3500 }, { name: 'Ben', cents: 3500 }], by: 'Ben' }),
    ]);
    await expect(
      asAnon('select save_expense($1, $2::jsonb)', [
        s,
        json({ kind: 'payment', description: 'Paid back', amountCents: 3500, paidBy: 'Ben', split: [{ name: 'ben', cents: 3500 }] }),
      ]),
    ).rejects.toThrow(/one person to one other/);
    await asAnon('select save_expense($1, $2::jsonb)', [
      s,
      json({ kind: 'payment', description: 'Paid back', amountCents: 3500, paidBy: 'Ben', split: [{ name: 'Ana', cents: 3500 }], by: 'Ben' }),
    ]);
    const snack = await asAnon<any>('select save_expense($1, $2::jsonb)', [
      s,
      json({ ...gas, description: 'Snacks', amountCents: 900, split: [{ name: 'Ben', cents: 900 }], by: 'Ana' }),
    ]);
    expect(await asAnon('select save_expense($1, $2::jsonb)', [s, json({ id: snack.id, deleted: true, by: 'Ana' })])).toBeNull();

    const bundle = await asAnon<any>('select get_trip($1)', [s]);
    expect(bundle.expenses.map((x: any) => `${x.kind}:${x.description}:${x.amountCents}`).sort()).toEqual([
      'expense:Gas:7000',
      'payment:Paid back:3500',
    ]);
    const log = bundle.activity.filter((a: any) => a.action.includes('expense') || a.action === 'payment_recorded');
    expect(log.map((a: any) => `${a.actor} ${a.action} ${a.title}`)).toEqual([
      'Ana expense_deleted Snacks',
      'Ana expense_added Snacks',
      'Ben payment_recorded Ben → Ana',
      'Ben expense_updated Gas',
      'Ana expense_added Gas',
    ]);
    expect(log[3].changes).toEqual([
      { field: 'amountCents', from: 6420, to: 7000 },
      { field: 'split', from: gas.split, to: [{ name: 'Ana', cents: 3500 }, { name: 'Ben', cents: 3500 }] },
    ]);
    expect(log[4].expenseId).toBe(saved.id);
  });

  it('saves currency, households and payment handles on the trip', async () => {
    const trip = await asAnon<any>('select create_trip($1::jsonb)', [
      json({ name: 'Money', startDate: '2027-08-01', endDate: '2027-08-05', travelers: ['Mom', 'Dad', 'Kid', 'Gran'] }),
    ]);
    const updated = await asAnon<any>('select update_trip($1, $2::jsonb)', [
      trip.slug,
      json({
        currency: 'eur',
        households: [{ name: ' The Smiths ', members: ['Mom', 'Dad', 'Kid', 'mom'] }, { name: '', members: ['x'] }],
        people: { Mom: { venmo: '@mom-s' } },
        by: 'Mom',
      }),
    ]);
    expect(updated.currency).toBe('EUR');
    expect(updated.households).toEqual([{ name: 'The Smiths', members: ['Mom', 'Dad', 'Kid'] }]);
    expect(updated.people).toEqual({ Mom: { venmo: '@mom-s' } });
    await expect(asAnon('select update_trip($1, $2::jsonb)', [trip.slug, json({ currency: 'euro' })])).rejects.toThrow(
      /trips_currency_code/,
    );
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
