import type { EventInput, Trip, TripBundle, TripEvent, TripInput } from '../types';

/**
 * Where trips live. The real app uses Supabase; without Supabase settings the app runs in
 * demo mode with trips kept in this browser only.
 */
export interface TripStore {
  readonly mode: 'supabase' | 'local';
  createTrip(input: TripInput): Promise<Trip>;
  /** Null when the trip does not exist or was deleted. */
  getTrip(slug: string): Promise<TripBundle | null>;
  updateTrip(slug: string, patch: Partial<TripInput>): Promise<Trip>;
  deleteTrip(slug: string): Promise<void>;
  saveEvent(slug: string, event: EventInput): Promise<TripEvent>;
  deleteEvent(slug: string, eventId: string, by: string): Promise<void>;
  restoreEvent(slug: string, eventId: string, by: string): Promise<TripEvent>;
  /** Calls back when someone else changes the trip. Returns an unsubscribe function. */
  subscribe(slug: string, onChange: () => void): () => void;
  /** Tells other open copies of the trip that it changed. */
  notifyChanged(slug: string): void;
}

export class StoreError extends Error {
  constructor(
    message: string,
    /** True when the server could not be reached at all. */
    readonly offline: boolean = false,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof StoreError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}
