// Small JSON helpers over localStorage: the browser's storage on web, and on iOS/Android the
// SQLite-backed polyfill installed by `expo-sqlite/localStorage/install` in the root layout.
// Storage can be missing or full (private browsing, quota), so every call is guarded and
// the app keeps working without it.

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: the data is only a convenience copy.
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}
