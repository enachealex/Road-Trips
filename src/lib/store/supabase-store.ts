import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

import type { EventInput, Trip, TripBundle, TripEvent, TripInput } from '../types';
import { StoreError, type TripStore } from './types';

// Every call goes through the RPC functions in supabase/schema.sql. The tables themselves
// are closed to the public key; knowing a trip's slug is what grants access to it.

const FRIENDLY: Record<string, string> = {
  P0002: 'This trip or event no longer exists. Someone may have deleted it.',
  '23514': 'Some of the details are not valid. Check the dates and required fields.',
  '22007': 'A date or time is not valid.',
  '22008': 'A date or time is not valid.',
  '22P02': 'Some of the details are not in the expected format.',
};

export function createSupabaseStore(url: string, key: string): TripStore {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const channels = new Map<string, RealtimeChannel>();

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    let result;
    try {
      result = await client.rpc(fn, args);
    } catch {
      throw new StoreError('Can’t reach the server. Check your connection and try again.', true);
    }
    const { data, error } = result;
    if (error) {
      // Postgres errors carry a SQLSTATE code; a failed fetch does not.
      if (!error.code) throw new StoreError('Can’t reach the server. Check your connection and try again.', true);
      throw new StoreError(FRIENDLY[error.code] ?? error.message);
    }
    return data as T;
  }

  return {
    mode: 'supabase',
    createTrip: (input: TripInput) => rpc<Trip>('create_trip', { p_trip: input }),
    getTrip: (slug: string) => rpc<TripBundle | null>('get_trip', { p_slug: slug }),
    updateTrip: (slug: string, patch: Partial<TripInput>) => rpc<Trip>('update_trip', { p_slug: slug, p_trip: patch }),
    deleteTrip: (slug: string) => rpc<void>('delete_trip', { p_slug: slug }),
    saveEvent: (slug: string, event: EventInput) => rpc<TripEvent>('upsert_event', { p_slug: slug, p_event: event }),
    deleteEvent: (slug: string, eventId: string, by: string) =>
      rpc<void>('delete_event', { p_slug: slug, p_event_id: eventId, p_by: by }),
    restoreEvent: (slug: string, eventId: string, by: string) =>
      rpc<TripEvent>('restore_event', { p_slug: slug, p_event_id: eventId, p_by: by }),

    subscribe(slug, onChange) {
      const channel = client
        .channel(`trip:${slug}`)
        .on('broadcast', { event: 'changed' }, () => onChange())
        .subscribe();
      channels.set(slug, channel);
      return () => {
        channels.delete(slug);
        void client.removeChannel(channel);
      };
    },

    notifyChanged(slug) {
      void channels.get(slug)?.send({ type: 'broadcast', event: 'changed', payload: {} });
    },
  };
}
