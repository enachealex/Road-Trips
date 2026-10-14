import type {
  EventInput,
  Expense,
  ExpenseInput,
  ListInput,
  ListItem,
  ListItemInput,
  Message,
  Trip,
  TripBundle,
  TripEvent,
  TripInput,
  TripList,
  TripPatch,
} from '../types';

export interface NewMessage {
  body: string;
  by: string;
  eventId: string | null;
}

/**
 * Where trips live. The real app uses Supabase; without Supabase settings the app runs in
 * demo mode with trips kept in this browser only. Every change carries the name of the
 * person making it ("by", or updatedBy on events).
 */
export interface TripStore {
  readonly mode: 'supabase' | 'local';
  createTrip(input: TripInput & { currency?: string }, by: string): Promise<Trip>;
  /** Null when the trip does not exist or was deleted. */
  getTrip(slug: string): Promise<TripBundle | null>;
  updateTrip(slug: string, patch: TripPatch, by: string): Promise<Trip>;
  deleteTrip(slug: string): Promise<void>;
  saveEvent(slug: string, event: EventInput): Promise<TripEvent>;
  deleteEvent(slug: string, eventId: string, by: string): Promise<void>;
  restoreEvent(slug: string, eventId: string, by: string): Promise<TripEvent>;
  /** Oldest first. With `after`, only messages newer than that time. */
  getMessages(slug: string, after?: string | null): Promise<Message[]>;
  postMessage(slug: string, message: NewMessage): Promise<Message>;
  /** Only the author can delete a message. */
  deleteMessage(slug: string, messageId: string, by: string): Promise<Message>;
  saveList(slug: string, list: ListInput, by: string): Promise<TripList>;
  deleteList(slug: string, listId: string, by: string): Promise<void>;
  saveListItem(slug: string, item: ListItemInput, by: string): Promise<ListItem>;
  deleteListItem(slug: string, itemId: string, by: string): Promise<void>;
  /** The split must add up to the amount. */
  saveExpense(slug: string, expense: ExpenseInput, by: string): Promise<Expense>;
  deleteExpense(slug: string, expenseId: string, by: string): Promise<void>;
  /** Calls back when someone else changes the plan or posts in the chat. Returns an unsubscribe function. */
  subscribe(slug: string, handlers: { onChange: () => void; onMessage: () => void }): () => void;
  /** Tells other open copies of the trip that the plan or the chat changed. */
  notify(slug: string, what: 'plan' | 'messages'): void;
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
