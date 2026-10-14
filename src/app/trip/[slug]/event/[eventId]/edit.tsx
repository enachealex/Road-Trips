import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { EventForm } from '@/components/event-form';
import { Card, Screen } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import { useLoadedTrip } from '@/lib/trip-context';

export default function EditEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { slug, bundle, saveEvent } = useLoadedTrip();
  // Keep editing what was opened even if a refresh arrives mid-edit.
  const [event] = useState(() => bundle.events.find((e) => e.id === eventId));

  const done = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/trip/[slug]/event/[eventId]', params: { slug, eventId } });

  if (!event) {
    return (
      <Screen>
        <Card>
          <ThemedText type="subtitle">This item isn’t in the trip</ThemedText>
          <ThemedText themeColor="textSecondary">Someone may have deleted it.</ThemedText>
          <Button label="Back to the trip" onPress={() => router.replace({ pathname: '/trip/[slug]', params: { slug } })} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <EventForm
        trip={bundle.trip}
        initial={event}
        submitLabel="Save changes"
        onCancel={done}
        onSubmit={async (input) => {
          await saveEvent({ ...input, id: event.id });
          done();
        }}
      />
    </Screen>
  );
}
