import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Sets the browser tab's title on web while the screen is shown. No effect in the apps. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
