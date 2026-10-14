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
  /** Optional: copies saved before names were recorded don't have them. */
  createdBy?: string;
  updatedBy?: string;
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
  /** Who added it. Optional: copies saved before names were recorded don't have it. */
  createdBy?: string;
  /** Who changed it last. */
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
  /** The latest changes, newest first. Optional for copies saved before it existed. */
  activity?: ActivityEntry[];
}

export type ActivityAction =
  | 'trip_created'
  | 'trip_updated'
  | 'event_added'
  | 'event_updated'
  | 'event_deleted'
  | 'event_restored';

/** One field an edit changed. Field names match TripEvent/Trip keys, or "details.<key>". */
export interface ActivityChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ActivityEntry {
  id: string;
  at: string;
  actor: string;
  action: ActivityAction;
  eventId: string | null;
  /** The event's (or trip's) title at the time. */
  title: string;
  kind: EventKind | null;
  changes: ActivityChange[];
}

export interface Message {
  id: string;
  author: string;
  /** Empty once deleted. */
  body: string;
  /** The event the message is about, if any. */
  eventId: string | null;
  createdAt: string;
  deleted: boolean;
}

export type TripInput = Pick<Trip, 'name' | 'startDate' | 'endDate' | 'travelers' | 'notes'>;

export type EventInput = Omit<TripEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createdBy'> & {
  id?: string;
};
