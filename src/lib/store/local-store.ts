import { eventChanges, tripChanges } from '../activity';
import { sameName } from '../people';
import { readJSON, writeJSON } from '../storage';
import type {
  ActivityAction,
  ActivityChange,
  ActivityEntry,
  EventInput,
  Message,
  Trip,
  TripBundle,
  TripEvent,
  TripInput,
} from '../types';
import { StoreError, type NewMessage, type TripStore } from './types';

// Demo mode: the same behaviour as the Supabase functions, kept in this browser's storage.
// Other tabs on the same device see changes through the "storage" event.

interface LocalTrip {
  trip: Trip;
  events: TripEvent[];
  activity?: ActivityEntry[];
  messages?: Message[];
  deleted?: boolean;
}

const KEY = 'roadbook.local.trips';
const MESSAGES_KEY = 'roadbook.local.messages';
const THIRTY_DAYS = 30 * 86_400_000;
const NOT_FOUND = 'This trip or item no longer exists. Someone may have deleted it.';

const load = () => readJSON<Record<string, LocalTrip>>(KEY, {});
const save = (db: Record<string, LocalTrip>) => writeJSON(KEY, db);
const loadMessages = () => readJSON<Record<string, Message[]>>(MESSAGES_KEY, {});
const saveMessages = (all: Record<string, Message[]>) => writeJSON(MESSAGES_KEY, all);

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

/** Same clean-up as roadbook.text_array in the schema: trimmed, no blanks, no case-insensitive repeats. */
function cleanNames(names: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (name && !out.some((n) => sameName(n, name))) out.push(name);
  }
  return out;
}

const cleanActor = (by: string | undefined) => (by ?? '').trim().slice(0, 60);

function findTrip(db: Record<string, LocalTrip>, slug: string): LocalTrip {
  const entry = db[slug];
  if (!entry || entry.deleted) throw new StoreError(NOT_FOUND);
  return entry;
}

function checkDates(start: string, end: string | null) {
  if (end && end < start) throw new StoreError('Some of the details are not valid. Check the dates and required fields.');
}

function log(
  entry: LocalTrip,
  actor: string,
  action: ActivityAction,
  title: string,
  event: TripEvent | null,
  changes: ActivityChange[] = [],
) {
  const item: ActivityEntry = {
    id: uuid(),
    at: new Date().toISOString(),
    actor,
    action,
    eventId: event?.id ?? null,
    title,
    kind: event?.kind ?? null,
    changes,
  };
  entry.activity = [item, ...(entry.activity ?? [])];
}

export const localStore: TripStore = {
  mode: 'local',

  async createTrip(input: TripInput, by: string) {
    checkDates(input.startDate, input.endDate);
    const now = new Date().toISOString();
    const actor = cleanActor(by);
    const trip: Trip = {
      slug: randomHex(8),
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      travelers: cleanNames(input.travelers),
      notes: input.notes ?? '',
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
      updatedAt: now,
    };
    const db = load();
    const entry: LocalTrip = { trip, events: [] };
    log(entry, actor, 'trip_created', trip.name, null);
    db[trip.slug] = entry;
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
      activity: (entry.activity ?? []).slice(0, 80),
    };
  },

  async updateTrip(slug: string, patch: Partial<TripInput>, by: string) {
    const db = load();
    const entry = findTrip(db, slug);
    const actor = cleanActor(by);
    const next: Trip = {
      ...entry.trip,
      name: patch.name?.trim() || entry.trip.name,
      startDate: patch.startDate ?? entry.trip.startDate,
      endDate: patch.endDate ?? entry.trip.endDate,
      travelers: patch.travelers ? cleanNames(patch.travelers) : entry.trip.travelers,
      notes: patch.notes ?? entry.trip.notes,
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    };
    checkDates(next.startDate, next.endDate);
    const changes = tripChanges(entry.trip, next);
    if (changes.length) log(entry, actor, 'trip_updated', next.name, null, changes);
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
    const actor = cleanActor(input.updatedBy);
    const existing = input.id ? entry.events.find((e) => e.id === input.id) : undefined;
    if (input.id && !existing) throw new StoreError(NOT_FOUND);
    const event: TripEvent = {
      ...input,
      id: existing?.id ?? uuid(),
      title: input.title.trim(),
      travelers: cleanNames(input.travelers),
      createdBy: existing ? existing.createdBy ?? '' : actor,
      updatedBy: actor,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    if (!existing) log(entry, actor, 'event_added', event.title, event);
    else {
      const changes = eventChanges(existing, event);
      if (existing.deletedAt) log(entry, actor, 'event_restored', event.title, event, changes);
      else if (changes.length) log(entry, actor, 'event_updated', event.title, event, changes);
    }
    entry.events = existing ? entry.events.map((e) => (e.id === event.id ? event : e)) : [...entry.events, event];
    entry.trip = { ...entry.trip, updatedAt: now };
    save(db);
    return event;
  },

  async deleteEvent(slug: string, eventId: string, by: string) {
    const db = load();
    const entry = findTrip(db, slug);
    const event = entry.events.find((e) => e.id === eventId && !e.deletedAt);
    if (!event) return;
    const actor = cleanActor(by);
    const deleted = { ...event, deletedAt: new Date().toISOString(), updatedBy: actor };
    entry.events = entry.events.map((e) => (e.id === eventId ? deleted : e));
    log(entry, actor, 'event_deleted', event.title, event);
    save(db);
  },

  async restoreEvent(slug: string, eventId: string, by: string) {
    const db = load();
    const entry = findTrip(db, slug);
    const event = entry.events.find((e) => e.id === eventId);
    if (!event) throw new StoreError(NOT_FOUND);
    const actor = cleanActor(by);
    const restored = { ...event, deletedAt: null, updatedBy: actor, updatedAt: new Date().toISOString() };
    entry.events = entry.events.map((e) => (e.id === eventId ? restored : e));
    log(entry, actor, 'event_restored', event.title, event);
    save(db);
    return restored;
  },

  async getMessages(slug: string, after?: string | null) {
    findTrip(load(), slug);
    const messages = loadMessages()[slug] ?? [];
    return (after ? messages.filter((m) => m.createdAt > after) : messages).slice(-300);
  },

  async postMessage(slug: string, message: NewMessage) {
    const entry = findTrip(load(), slug);
    const author = cleanActor(message.by);
    const body = message.body.trim();
    if (!author) throw new StoreError('Choose who you are before sending a message');
    if (!body || body.length > 4000) throw new StoreError('Messages can be 1 to 4,000 characters.');
    const eventId = message.eventId && entry.events.some((e) => e.id === message.eventId) ? message.eventId : null;
    const saved: Message = { id: uuid(), author, body, eventId, createdAt: new Date().toISOString(), deleted: false };
    const all = loadMessages();
    all[slug] = [...(all[slug] ?? []), saved];
    saveMessages(all);
    return saved;
  },

  async deleteMessage(slug: string, messageId: string, by: string) {
    findTrip(load(), slug);
    const all = loadMessages();
    const message = (all[slug] ?? []).find((m) => m.id === messageId && !m.deleted && sameName(m.author, by));
    if (!message) throw new StoreError('Message not found');
    const deleted = { ...message, body: '', deleted: true };
    all[slug] = all[slug].map((m) => (m.id === messageId ? deleted : m));
    saveMessages(all);
    return deleted;
  },

  subscribe(_slug, { onChange, onMessage }) {
    if (typeof window === 'undefined' || !window.addEventListener) return () => {};
    const listener = (e: StorageEvent) => {
      if (e.key === KEY) onChange();
      if (e.key === MESSAGES_KEY) onMessage();
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  },

  notify() {
    // Other tabs are told by the browser's storage event.
  },
};
