// Dates are calendar strings ("2027-07-04") and times are "HH:MM", always in the local
// time of the place where the thing happens. See dates.ts.

export type EventKind =
  | 'flight'
  | 'drive'
  | 'train'
  | 'bus'
  | 'ferry'
  | 'car_rental'
  | 'transit'
  | 'lodging'
  | 'activity'
  | 'meal'
  | 'note';

export interface Trip {
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  travelers: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripEvent {
  id: string;
  kind: EventKind;
  title: string;
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  /** Place name, or the departure point for transport. */
  location: string;
  address: string;
  /** Arrival point for transport, or the return location for a rental. */
  endLocation: string;
  endAddress: string;
  confirmation: string;
  url: string;
  phone: string;
  notes: string;
  /** Who this applies to. Empty means everyone on the trip. */
  travelers: string[];
  /** Kind-specific extras such as airline or flight number. See kinds.ts. */
  details: Record<string, string>;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TripBundle {
  trip: Trip;
  events: TripEvent[];
  /** Deleted in the last 30 days, newest first. */
  deletedEvents: TripEvent[];
}

export type TripInput = Pick<Trip, 'name' | 'startDate' | 'endDate' | 'travelers' | 'notes'>;

export type EventInput = Omit<TripEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  id?: string;
};
