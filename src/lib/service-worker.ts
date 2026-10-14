import { Platform } from 'react-native';

/**
 * Registers public/sw.js, which keeps the app itself loadable without a connection. Trip
 * data is cached separately by the app (see my-trips.ts). Production web builds only, so
 * development never serves stale code.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web' || process.env.NODE_ENV !== 'production') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Offline support is a bonus; the site works without it.
  });
}
