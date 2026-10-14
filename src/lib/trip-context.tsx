import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { IdentityPicker } from '@/components/identity-picker';

import {
  getMyName,
  readCachedMessages,
  readCachedTrip,
  readIdentity,
  readLastRead,
  readLastSeen,
  readTravelerFilter,
  rememberTrip,
  writeCachedMessages,
  writeCachedTrip,
  writeIdentity,
  writeLastRead,
  writeLastSeen,
  writeTravelerFilter,
} from './my-trips';
import { sameName } from './people';
import { errorMessage, store, StoreError } from './store';
import type { EventInput, Message, TripBundle, TripEvent, TripInput } from './types';

type Status = 'loading' | 'ready' | 'not-found' | 'error';

interface TripContextValue {
  slug: string;
  bundle: TripBundle | null;
  status: Status;
  error: string | null;
  /** Set when the server can't be reached and the saved copy is showing instead. */
  offlineSince: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Whose plan is showing; null means everyone's. */
  traveler: string | null;
  setTraveler: (name: string | null) => void;

  /** Who is using this device, on this trip. */
  me: string | null;
  /** Opens the "Who are you?" picker. Resolves with the chosen name, or null if dismissed. */
  chooseIdentity: () => Promise<string | null>;

  saveEvent: (input: EventInput) => Promise<TripEvent>;
  deleteEvent: (id: string) => Promise<void>;
  restoreEvent: (id: string) => Promise<void>;
  updateTrip: (patch: Partial<TripInput>) => Promise<void>;
  deleteTrip: () => Promise<void>;

  /** When this device last caught up on the activity feed. */
  lastSeen: string | null;
  markSeen: () => void;

  messages: Message[];
  unreadCount: number;
  refreshMessages: (options?: { full?: boolean }) => Promise<void>;
  sendMessage: (body: string, eventId: string | null) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  markRead: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function useTrip(): TripContextValue {
  const value = useContext(TripContext);
  if (!value) throw new Error('useTrip must be used inside <TripProvider>');
  return value;
}

/** The loaded trip, for screens that only render once it is ready. */
export function useLoadedTrip() {
  const ctx = useTrip();
  if (!ctx.bundle) throw new Error('useLoadedTrip used before the trip loaded');
  return { ...ctx, bundle: ctx.bundle };
}

const NEED_NAME = 'Choose who you are first, so everyone can see who made the change.';

export function TripProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // Show the saved copy straight away, then replace it with fresh data.
  const [cached] = useState(() => readCachedTrip(slug));
  const [bundle, setBundle] = useState<TripBundle | null>(cached?.bundle ?? null);
  const [status, setStatus] = useState<Status>(cached ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [traveler, setTravelerState] = useState<string | null>(() => readTravelerFilter(slug));
  const [me, setMe] = useState<string | null>(() => readIdentity(slug));
  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    // First visit on this device: nothing counts as "new" yet.
    const saved = readLastSeen(slug);
    if (saved) return saved;
    const now = new Date().toISOString();
    writeLastSeen(slug, now);
    return now;
  });
  const [messages, setMessages] = useState<Message[]>(() => readCachedMessages(slug));
  const [lastRead, setLastRead] = useState<string | null>(() => readLastRead(slug));
  const [picker, setPicker] = useState<{ resolve: ((name: string | null) => void) | null } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const prompted = useRef(false);

  const apply = useCallback((next: TripBundle) => {
    setBundle(next);
    setStatus('ready');
    setError(null);
    setOfflineSince(null);
    writeCachedTrip(next);
    rememberTrip(next.trip);
  }, []);

  const refresh = useCallback(() => {
    // Collapse overlapping refreshes (focus + realtime + manual) into one request.
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setRefreshing(true);
      try {
        const next = await store.getTrip(slug);
        if (next) apply(next);
        else {
          setBundle(null);
          setStatus('not-found');
        }
      } catch (e) {
        const saved = readCachedTrip(slug);
        if (saved) {
          setBundle(saved.bundle);
          setStatus('ready');
          setOfflineSince(saved.savedAt);
        } else {
          setStatus('error');
          setError(errorMessage(e));
        }
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [slug, apply]);

  const refreshMessages = useCallback(
    async ({ full = false }: { full?: boolean } = {}) => {
      try {
        const latest = messages.length ? messages[messages.length - 1].createdAt : null;
        const incoming = await store.getMessages(slug, full ? null : latest);
        setMessages((current) => {
          let next: Message[];
          if (full || !latest) next = incoming;
          else {
            const byId = new Map(current.map((m) => [m.id, m]));
            for (const m of incoming) byId.set(m.id, m);
            next = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          }
          writeCachedMessages(slug, next);
          return next;
        });
      } catch {
        // Offline: keep showing the saved copy.
      }
    },
    [slug, messages],
  );

  // Keep the latest refreshMessages for listeners registered once.
  const refreshMessagesRef = useRef(refreshMessages);
  useEffect(() => {
    refreshMessagesRef.current = refreshMessages;
  }, [refreshMessages]);

  // Load now, when someone else changes the trip or posts, when the app comes back to the
  // foreground, and when the connection returns.
  useEffect(() => {
    void refresh();
    const unsubscribe = store.subscribe(slug, {
      onChange: () => void refresh(),
      onMessage: () => void refreshMessagesRef.current({ full: true }),
    });
    const catchUp = () => {
      void refresh();
      void refreshMessagesRef.current({ full: true });
    };
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') catchUp();
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', catchUp);
    return () => {
      unsubscribe();
      appState.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', catchUp);
    };
  }, [slug, refresh]);

  // Load the chat once the trip itself exists (not for a bad or deleted link).
  useEffect(() => {
    if (status === 'ready') void refreshMessagesRef.current({ full: true });
  }, [status]);

  // Ask who this is the first time the trip opens on this device.
  useEffect(() => {
    if (status === 'ready' && bundle && !me && !prompted.current) {
      prompted.current = true;
      setPicker({ resolve: null });
    }
  }, [status, bundle, me]);

  const chooseIdentity = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        setPicker((current) => {
          current?.resolve?.(null);
          return { resolve };
        });
      }),
    [],
  );

  const closePicker = (name: string | null) => {
    if (name) {
      setMe(name);
      writeIdentity(slug, name);
    }
    picker?.resolve?.(name);
    setPicker(null);
  };

  const ensureIdentity = useCallback(async (): Promise<string> => {
    const name = me ?? (await chooseIdentity());
    if (!name) throw new StoreError(NEED_NAME);
    return name;
  }, [me, chooseIdentity]);

  const setTraveler = useCallback(
    (name: string | null) => {
      setTravelerState(name);
      writeTravelerFilter(slug, name);
    },
    [slug],
  );

  /** Runs a change, updates the local copy, tells other viewers, then fetches the new activity. */
  const mutate = useCallback(
    async <T,>(action: () => Promise<T>, update: (current: TripBundle, result: T) => TripBundle) => {
      const result = await action();
      setBundle((current) => {
        if (!current) return current;
        const next = update(current, result);
        writeCachedTrip(next);
        rememberTrip(next.trip);
        return next;
      });
      setOfflineSince(null);
      store.notify(slug, 'plan');
      void refresh();
      return result;
    },
    [slug, refresh],
  );

  const saveEvent = useCallback(
    async (input: EventInput) => {
      const by = await ensureIdentity();
      return mutate(
        () => store.saveEvent(slug, { ...input, updatedBy: by }),
        (b, saved) => ({
          ...b,
          events: [...b.events.filter((e) => e.id !== saved.id), saved],
          deletedEvents: b.deletedEvents.filter((e) => e.id !== saved.id),
        }),
      );
    },
    [slug, mutate, ensureIdentity],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const by = await ensureIdentity();
      await mutate(
        () => store.deleteEvent(slug, id, by),
        (b) => {
          const removed = b.events.find((e) => e.id === id);
          return {
            ...b,
            events: b.events.filter((e) => e.id !== id),
            deletedEvents: removed
              ? [{ ...removed, deletedAt: new Date().toISOString(), updatedBy: by }, ...b.deletedEvents]
              : b.deletedEvents,
          };
        },
      );
    },
    [slug, mutate, ensureIdentity],
  );

  const restoreEvent = useCallback(
    async (id: string) => {
      const by = await ensureIdentity();
      await mutate(
        () => store.restoreEvent(slug, id, by),
        (b, restored) => ({
          ...b,
          events: [...b.events, restored],
          deletedEvents: b.deletedEvents.filter((e) => e.id !== id),
        }),
      );
    },
    [slug, mutate, ensureIdentity],
  );

  const updateTripAs = useCallback(
    (patch: Partial<TripInput>, by: string) =>
      mutate(
        () => store.updateTrip(slug, patch, by),
        (b, trip) => ({ ...b, trip }),
      ),
    [slug, mutate],
  );

  const updateTrip = useCallback(
    async (patch: Partial<TripInput>) => {
      const by = await ensureIdentity();
      await updateTripAs(patch, by);
    },
    [ensureIdentity, updateTripAs],
  );

  const deleteTrip = useCallback(async () => {
    await store.deleteTrip(slug);
    store.notify(slug, 'plan');
  }, [slug]);

  const markSeen = useCallback(() => {
    const newest = bundle?.activity?.[0]?.at;
    const now = new Date().toISOString();
    const at = newest && newest > now ? newest : now;
    setLastSeen(at);
    writeLastSeen(slug, at);
  }, [bundle, slug]);

  const markRead = useCallback(() => {
    const newest = messages[messages.length - 1]?.createdAt;
    if (newest && newest !== lastRead) {
      setLastRead(newest);
      writeLastRead(slug, newest);
    }
  }, [messages, lastRead, slug]);

  const sendMessage = useCallback(
    async (body: string, eventId: string | null) => {
      const by = await ensureIdentity();
      const saved = await store.postMessage(slug, { body, by, eventId });
      setMessages((current) => {
        const next = [...current.filter((m) => m.id !== saved.id), saved];
        writeCachedMessages(slug, next);
        return next;
      });
      setLastRead(saved.createdAt);
      writeLastRead(slug, saved.createdAt);
      store.notify(slug, 'messages');
    },
    [slug, ensureIdentity],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      const by = await ensureIdentity();
      const deleted = await store.deleteMessage(slug, id, by);
      setMessages((current) => {
        const next = current.map((m) => (m.id === id ? deleted : m));
        writeCachedMessages(slug, next);
        return next;
      });
      store.notify(slug, 'messages');
    },
    [slug, ensureIdentity],
  );

  const unreadCount = useMemo(
    () =>
      messages.filter((m) => !m.deleted && (!lastRead || m.createdAt > lastRead) && !(me && sameName(m.author, me)))
        .length,
    [messages, lastRead, me],
  );

  return (
    <TripContext.Provider
      value={{
        slug,
        bundle,
        status,
        error,
        offlineSince,
        refreshing,
        refresh,
        traveler,
        setTraveler,
        me,
        chooseIdentity,
        saveEvent,
        deleteEvent,
        restoreEvent,
        updateTrip,
        deleteTrip,
        lastSeen,
        markSeen,
        messages,
        unreadCount,
        refreshMessages,
        sendMessage,
        deleteMessage,
        markRead,
      }}>
      {children}
      {picker && bundle ? (
        <IdentityPicker
          travelers={bundle.trip.travelers}
          current={me}
          suggested={getMyName()}
          onPick={closePicker}
          onAddSelf={async (name) => {
            // Joining the trip's list is itself a change, signed by the new person.
            if (!bundle.trip.travelers.some((t) => sameName(t, name))) {
              await updateTripAs({ travelers: [...bundle.trip.travelers, name] }, name);
            }
            closePicker(name);
          }}
          onCancel={() => closePicker(null)}
        />
      ) : null}
    </TripContext.Provider>
  );
}
