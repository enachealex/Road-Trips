import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://roadtrip.thejumpvault.com';

/** The site's own address: the current origin on web (so it also works locally), the live site in the apps. */
export function siteOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return SITE_URL;
}

export function tripUrl(slug: string, path = ''): string {
  return `${siteOrigin()}/trip/${slug}${path}`;
}

/**
 * Copies text. Call it straight from a press handler, not after an await: Safari only
 * allows clipboard writes that happen directly in response to a tap.
 */
export function copyText(text: string): Promise<boolean> {
  return Clipboard.setStringAsync(text);
}

/** Opens the system share sheet where there is one; otherwise copies the link. Resolves to what happened. */
export async function shareLink(title: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, url });
        return 'shared';
      } catch {
        return 'cancelled';
      }
    }
    return (await copyText(url)) ? 'copied' : 'cancelled';
  }
  const result = await Share.share({ title, message: `${title}\n${url}`, url });
  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

/** Saves a text file in the browser. Returns false where that isn't possible (the native apps). */
export function downloadTextFile(filename: string, content: string, mimeType: string): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return true;
}
