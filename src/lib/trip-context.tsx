import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import {
  getMyName,
  readCachedTrip,
  readTravelerFilter,
  rememberTrip,
  writeCachedTrip,
  writeTravelerFilter,
} from './my-trips';
import { errorMessage, store } from './store';
import type { EventInput, TripBundle, TripEvent, TripInput } from './types';

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
  saveEvent: (input: EventInput) => Promise<TripEvent>;
  deleteEvent: (id: string) => Promise<void>;
  restoreEvent: (id: string) => Promise<void>;
  updateTrip: (patch: Partial<TripInput>) => Promise<void>;
  deleteTrip: () => Promise<void>;
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

export function TripProvider({ slug, children }: { slug: string; children: ReactNode }) {
  // Show the saved copy straight away, then replace it with fresh data.
  const [cached] = useState(() => readCachedTrip(slug));
  const [bundle, setBundle] = useState<TripBundle | null>(cached?.bundle ?? null);
  const [status, setStatus] = useState<Status>(cached ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [traveler, setTravelerState] = useState<string | null>(() => readTravelerFilter(slug));
  const inFlight = useRef<Promise<void> | null>(null);

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

  // Load now, when someone else changes the trip, when the app comes back to the
  // foreground, and when the connection returns.
  useEffect(() => {
    void refresh();
    const unsubscribe = store.subscribe(slug, () => void refresh());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const onOnline = () => void refresh();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', onOnline);
    return () => {
      unsubscribe();
      appState.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    };
  }, [slug, refresh]);

  const setTraveler = useCallback(
    (name: string | null) => {
      setTravelerState(name);
      writeTravelerFilter(slug, name);
    },
    [slug],
  );

  /** Runs a change, then updates the local copy and tells other viewers. */
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
      store.notifyChanged(slug);
      return result;
    },
    [slug],
  );

  const saveEvent = useCallback(
    (input: EventInput) =>
      mutate(
        () => store.saveEvent(slug, { ...input, updatedBy: getMyName() }),
        (b, saved) => ({
          ...b,
          events: [...b.events.filter((e) => e.id !== saved.id), saved],
          deletedEvents: b.deletedEvents.filter((e) => e.id !== saved.id),
        }),
      ),
    [slug, mutate],
  );

  const deleteEvent = useCallback(
    (id: string) =>
      mutate(
        () => store.deleteEvent(slug, id, getMyName()),
        (b) => {
          const removed = b.events.find((e) => e.id === id);
          return {
            ...b,
            events: b.events.filter((e) => e.id !== id),
            deletedEvents: removed
              ? [{ ...removed, deletedAt: new Date().toISOString(), updatedBy: getMyName() }, ...b.deletedEvents]
              : b.deletedEvents,
          };
        },
      ),
    [slug, mutate],
  );

  const restoreEvent = useCallback(
    async (id: string) => {
      await mutate(
        () => store.restoreEvent(slug, id, getMyName()),
        (b, restored) => ({
          ...b,
          events: [...b.events, restored],
          deletedEvents: b.deletedEvents.filter((e) => e.id !== id),
        }),
      );
    },
    [slug, mutate],
  );

  const updateTrip = useCallback(
    async (patch: Partial<TripInput>) => {
      await mutate(
        () => store.updateTrip(slug, patch),
        (b, trip) => ({ ...b, trip }),
      );
    },
    [slug, mutate],
  );

  const deleteTrip = useCallback(async () => {
    await store.deleteTrip(slug);
    store.notifyChanged(slug);
  }, [slug]);

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
        saveEvent,
        deleteEvent,
        restoreEvent,
        updateTrip,
        deleteTrip,
      }}>
      {children}
    </TripContext.Provider>
  );
}
