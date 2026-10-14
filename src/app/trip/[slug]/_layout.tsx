import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card, Screen } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { forgetTrip } from '@/lib/my-trips';
import { TripProvider, useTrip } from '@/lib/trip-context';

// Opening a link straight to an event still puts the itinerary underneath it.
export const unstable_settings = { initialRouteName: 'index' };

/** Shows loading and error states until the trip is ready, so the screens inside can assume it. */
function TripGate({ children }: { children: ReactNode }) {
  const { status, error, refresh, slug } = useTrip();
  const c = useTheme();

  if (status === 'ready') return children;

  if (status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} size="large" />
        <ThemedText themeColor="textSecondary">Loading the trip…</ThemedText>
      </View>
    );
  }

  return (
    <Screen>
      <Card style={styles.message}>
        <ThemedText type="subtitle">
          {status === 'not-found' ? 'This trip isn’t available' : 'Couldn’t load the trip'}
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {status === 'not-found'
            ? 'It may have been deleted, or the link is incomplete. Ask whoever sent it for a fresh link.'
            : error}
        </ThemedText>
        {status === 'error' ? <Button label="Try again" variant="primary" icon="refresh" onPress={refresh} /> : null}
        <Button
          label="Go to my trips"
          icon="home"
          onPress={() => {
            if (status === 'not-found') forgetTrip(slug);
            router.replace('/');
          }}
        />
      </Card>
    </Screen>
  );
}

export default function TripLayout() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const c = useTheme();

  return (
    <TripProvider slug={slug} key={slug}>
      <TripGate>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '700' },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: c.background },
          }}>
          <Stack.Screen name="index" options={{ title: 'Trip' }} />
          <Stack.Screen name="settings" options={{ title: 'Share & settings' }} />
          <Stack.Screen name="event/new" options={{ title: 'Add to the plan' }} />
          <Stack.Screen name="event/[eventId]/index" options={{ title: 'Details' }} />
          <Stack.Screen name="event/[eventId]/edit" options={{ title: 'Edit' }} />
        </Stack>
      </TripGate>
    </TripProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  message: {
    marginTop: Spacing.five,
  },
});
