import { readJSON, writeJSON } from '../storage';
import type { EventInput, Trip, TripBundle, TripEvent, TripInput } from '../types';
import { StoreError, type TripStore } from './types';

// Demo mode: the same behaviour as the Supabase functions, kept in this browser's storage.
// Other tabs on the same device see changes through the "storage" event.

interface LocalTrip {
  trip: Trip;
  events: TripEvent[];
  deleted?: boolean;
}

const KEY = 'roadbook.local.trips';
const THIRTY_DAYS = 30 * 86_400_000;

const load = () => readJSON<Record<string, LocalTrip>>(KEY, {});
const save = (db: Record<string, LocalTrip>) => writeJSON(KEY, db);

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else for (let i = 0; i < bytes; i++) values[i] = Math.floor(Math.random() * 256);
  return Array.from(values, (v) => v.toString(16).padStart(2, '0')).join('');
}

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
}

/** Same clean-up as rb_text_array in the schema: trimmed, no blanks, no case-insensitive repeats. */
function cleanNames(names: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

function findTrip(db: Record<string, LocalTrip>, slug: string): LocalTrip {
  const entry = db[slug];
  if (!entry || entry.deleted) throw new StoreError('This trip or event no longer exists. Someone may have deleted it.');
  return entry;
}

function checkDates(start: string, end: string | null) {
  if (end && end < start) throw new StoreError('Some of the details are not valid. Check the dates and required fields.');
}

export const localStore: TripStore = {
  mode: 'local',

  async createTrip(input: TripInput) {
    checkDates(input.startDate, input.endDate);
    const now = new Date().toISOString();
    const trip: Trip = {
      slug: randomHex(8),
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      travelers: cleanNames(input.travelers),
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
    };
    const db = load();
    db[trip.slug] = { trip, events: [] };
    save(db);
    return trip;
  },

  async getTrip(slug: string): Promise<TripBundle | null> {
    const entry = load()[slug];
    if (!entry || entry.deleted) return null;
    const cutoff = Date.now() - THIRTY_DAYS;
    const byStart = (a: TripEvent, b: TripEvent) =>
      a.startDate.localeCompare(b.startDate) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.createdAt.localeCompare(b.createdAt);
    return {
      trip: entry.trip,
      events: entry.events.filter((e) => !e.deletedAt).sort(byStart),
      deletedEvents: entry.events
        .filter((e) => e.deletedAt && Date.parse(e.deletedAt) > cutoff)
        .sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!)),
    };
  },

  async updateTrip(slug: string, patch: Partial<TripInput>) {
    const db = load();
    const entry = findTrip(db, slug);
    const next: Trip = {
      ...entry.trip,
      name: patch.name?.trim() || entry.trip.name,
      startDate: patch.startDate ?? entry.trip.startDate,
      endDate: patch.endDate ?? entry.trip.endDate,
      travelers: patch.travelers ? cleanNames(patch.travelers) : entry.trip.travelers,
      notes: patch.notes ?? entry.trip.notes,
      updatedAt: new Date().toISOString(),
    };
    checkDates(next.startDate, next.endDate);
    entry.trip = next;
    save(db);
    return next;
  },

  async deleteTrip(slug: string) {
    const db = load();
    findTrip(db, slug).deleted = true;
    save(db);
  },

  async saveEvent(slug: string, input: EventInput) {
    checkDates(input.startDate, input.endDate);
    const db = load();
    const entry = findTrip(db, slug);
    const now = new Date().toISOString();
    const existing = input.id ? entry.events.find((e) => e.id === input.id) : undefined;
    if (input.id && !existing) throw new StoreError('This trip or event no longer exists. Someone may have deleted it.');
    const event: TripEvent = {
      ...input,
      id: existing?.id ?? uuid(),
      title: input.title.trim(),
      travelers: cleanNames(input.travelers),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    entry.events = existing ? entry.events.map((e) => (e.id === event.id ? event : e)) : [...entry.events, event];
    entry.trip = { ...entry.trip, updatedAt: now };
    save(db);
    return event;
  },

  async deleteEvent(slug: string, eventId: string, by: string) {
    const db = load();
    const entry = findTrip(db, slug);
    const now = new Date().toISOString();
    entry.events = entry.events.map((e) =>
      e.id === eventId && !e.deletedAt ? { ...e, deletedAt: now, updatedBy: by } : e,
    );
    save(db);
  },

  async restoreEvent(slug: string, eventId: string, by: string) {
    const db = load();
    const entry = findTrip(db, slug);
    const event = entry.events.find((e) => e.id === eventId);
    if (!event) throw new StoreError('This trip or event no longer exists. Someone may have deleted it.');
    const restored = { ...event, deletedAt: null, updatedBy: by, updatedAt: new Date().toISOString() };
    entry.events = entry.events.map((e) => (e.id === eventId ? restored : e));
    save(db);
    return restored;
  },

  subscribe(_slug, onChange) {
    if (typeof window === 'undefined' || !window.addEventListener) return () => {};
    const listener = (e: StorageEvent) => {
      if (e.key === KEY) onChange();
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },

  notifyChanged() {
    // Other tabs are told by the browser's storage event.
  },
};
