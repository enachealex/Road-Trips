import { localStore } from './local-store';
import { createSupabaseStore } from './supabase-store';
import type { TripStore } from './types';

export { errorMessage, StoreError } from './types';
export type { TripStore } from './types';

// EXPO_PUBLIC_ variables are inlined at build time and must be read with dot notation.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

export const store: TripStore = url && key ? createSupabaseStore(url, key) : localStore;

/** True when no Supabase server is configured and trips only live in this browser. */
export const isDemoMode = store.mode === 'local';
