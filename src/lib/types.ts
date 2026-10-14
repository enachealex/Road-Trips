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
  /** ISO 4217 code, e.g. "USD". Optional for copies saved before costs existed. */
  currency?: string;
  /** Groups of travelers who can settle up together. */
  households?: Household[];
  /** Payment handles people chose to share, by name. */
  people?: Record<string, PayHandles>;
  /** Optional: copies saved before names were recorded don't have them. */
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Household {
  name: string;
  members: string[];
}

export interface PayHandles {
  venmo?: string;
  paypal?: string;
  zelle?: string;
}

export type ListKind = 'packing' | 'todo' | 'other';

export interface ListItem {
  id: string;
  listId: string;
  text: string;
  /** Who it's for; null means anyone. */
  assignee: string | null;
  dueDate: string | null;
  done: boolean;
  doneBy: string;
  doneAt: string | null;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripList {
  id: string;
  name: string;
  kind: ListKind;
  position: number;
  createdBy: string;
  createdAt: string;
  items: ListItem[];
}

export type ExpenseCategory =
  | 'lodging'
  | 'transport'
  | 'fuel'
  | 'food'
  | 'groceries'
  | 'activities'
  | 'shopping'
  | 'other';

export interface Share {
  name: string;
  cents: number;
}

export interface Expense {
  id: string;
  /** "payment" is one person paying another back; its split holds the single recipient. */
  kind: 'expense' | 'payment';
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  paidBy: string;
  /** Each person's share in cents; always adds up to amountCents. */
  split: Share[];
  splitMode: 'equal' | 'exact' | 'shares';
  /** What was typed: share counts for equal/shares, cents for exact. */
  splitInput: Record<string, number>;
  date: string;
  eventId: string | null;
  notes: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseInput = Omit<Expense, 'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

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
  lists?: TripList[];
  /** Newest first. */
  expenses?: Expense[];
}

export type ActivityAction =
  | 'trip_created'
  | 'trip_updated'
  | 'event_added'
  | 'event_updated'
  | 'event_deleted'
  | 'event_restored'
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'payment_recorded'
  | 'list_added'
  | 'list_deleted';

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
  expenseId?: string | null;
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

/** Any trip details that can change after it's created. */
export type TripPatch = Partial<TripInput & Pick<Trip, 'currency' | 'households' | 'people'>>;

export interface ListInput {
  id?: string;
  name: string;
  kind: ListKind;
  /** Only when creating, e.g. copying a list from another trip. */
  items?: { text: string; assignee?: string | null }[];
}

export type ListItemInput = Partial<Pick<ListItem, 'text' | 'assignee' | 'dueDate' | 'done' | 'position'>> & {
  id?: string;
  listId: string;
};

export type EventInput = Omit<TripEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createdBy'> & {
  id?: string;
};
