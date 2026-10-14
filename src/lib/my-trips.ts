import { readJSON, removeKey, writeJSON } from './storage';
import type { Message, Trip, TripBundle } from './types';

// What this device remembers: the trips it has opened, who the person is on each trip,
// what they have already seen, and the last copy of each trip and its chat for offline use.

export interface SavedTrip {
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  openedAt: string;
}

const TRIPS_KEY = 'roadbook.myTrips';
const NAME_KEY = 'roadbook.myName';
const cacheKey = (slug: string) => `roadbook.cache.${slug}`;
const filterKey = (slug: string) => `roadbook.filter.${slug}`;
const meKey = (slug: string) => `roadbook.me.${slug}`;
const seenKey = (slug: string) => `roadbook.seen.${slug}`;
const readKey = (slug: string) => `roadbook.read.${slug}`;
const messagesKey = (slug: string) => `roadbook.messages.${slug}`;

export function getMyTrips(): SavedTrip[] {
  return readJSON<SavedTrip[]>(TRIPS_KEY, []);
}

export function rememberTrip(trip: Trip): void {
  const others = getMyTrips().filter((t) => t.slug !== trip.slug);
  const entry: SavedTrip = {
    slug: trip.slug,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    openedAt: new Date().toISOString(),
  };
  writeJSON(TRIPS_KEY, [entry, ...others]);
}

export function forgetTrip(slug: string): void {
  writeJSON(
    TRIPS_KEY,
    getMyTrips().filter((t) => t.slug !== slug),
  );
  for (const key of [cacheKey, filterKey, meKey, seenKey, readKey, messagesKey]) removeKey(key(slug));
}

/** The name last picked on any trip, offered first on the next one. */
export function getMyName(): string {
  return readJSON<string>(NAME_KEY, '');
}

/** Who this device's person is on a trip. */
export function readIdentity(slug: string): string | null {
  return readJSON<string | null>(meKey(slug), null);
}

export function writeIdentity(slug: string, name: string): void {
  writeJSON(meKey(slug), name);
  writeJSON(NAME_KEY, name);
}

export interface CachedTrip {
  bundle: TripBundle;
  savedAt: string;
}

export function readCachedTrip(slug: string): CachedTrip | null {
  return readJSON<CachedTrip | null>(cacheKey(slug), null);
}

export function writeCachedTrip(bundle: TripBundle): void {
  writeJSON(cacheKey(bundle.trip.slug), { bundle, savedAt: new Date().toISOString() } satisfies CachedTrip);
}

/** Whose plan this device was last looking at ("Everyone" is null). */
export function readTravelerFilter(slug: string): string | null {
  return readJSON<string | null>(filterKey(slug), null);
}

export function writeTravelerFilter(slug: string, traveler: string | null): void {
  writeJSON(filterKey(slug), traveler);
}

/** When this device last caught up on the trip's activity. */
export function readLastSeen(slug: string): string | null {
  return readJSON<string | null>(seenKey(slug), null);
}

export function writeLastSeen(slug: string, at: string): void {
  writeJSON(seenKey(slug), at);
}

/** The newest message this device has read. */
export function readLastRead(slug: string): string | null {
  return readJSON<string | null>(readKey(slug), null);
}

export function writeLastRead(slug: string, at: string): void {
  writeJSON(readKey(slug), at);
}

export function readCachedMessages(slug: string): Message[] {
  return readJSON<Message[]>(messagesKey(slug), []);
}

export function writeCachedMessages(slug: string, messages: Message[]): void {
  writeJSON(messagesKey(slug), messages.slice(-300));
}
