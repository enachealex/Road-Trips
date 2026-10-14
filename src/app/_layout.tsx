// Gives iOS and Android a localStorage backed by SQLite. On web it does nothing.
import 'expo-sqlite/localStorage/install';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';

import { ConfirmProvider } from '@/components/confirm-dialog';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { registerServiceWorker } from '@/lib/service-worker';

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.primary, background: c.background, card: c.surface, text: c.text, border: c.border },
  };

  useEffect(registerServiceWorker, []);

  return (
    <ThemeProvider value={navTheme}>
      <ConfirmProvider>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '700' },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: c.background },
          }}>
          <Stack.Screen name="index" options={{ title: 'Roadbook', headerShown: false }} />
          <Stack.Screen name="new-trip" options={{ title: 'New trip' }} />
          <Stack.Screen name="trip/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
      </ConfirmProvider>
    </ThemeProvider>
  );
}
