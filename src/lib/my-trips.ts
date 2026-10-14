import { readJSON, removeKey, writeJSON } from './storage';
import type { Trip, TripBundle } from './types';

// What this device remembers: the trips it has opened, the person's name for "edited by",
// and the last copy of each trip for reading offline.

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
  removeKey(cacheKey(slug));
  removeKey(filterKey(slug));
}

export function getMyName(): string {
  return readJSON<string>(NAME_KEY, '');
}

export function setMyName(name: string): void {
  writeJSON(NAME_KEY, name.trim());
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
