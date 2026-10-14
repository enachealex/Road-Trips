import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { blankEvent, EventForm } from '@/components/event-form';
import { Screen } from '@/components/layout';
import { isValidDate, nowLocal } from '@/lib/dates';
import { KINDS } from '@/lib/kinds';
import { useLoadedTrip } from '@/lib/trip-context';
import type { EventInput, EventKind } from '@/lib/types';

export default function NewEventScreen() {
  const { slug, bundle, saveEvent } = useLoadedTrip();
  const params = useLocalSearchParams<{ date?: string; kind?: string; copy?: string }>();
  const { trip } = bundle;

  const [initial] = useState<EventInput>(() => {
    const source = params.copy ? bundle.events.find((e) => e.id === params.copy) : undefined;
    if (source) {
      const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = source;
      return { ...copy, title: `${copy.title} (copy)` };
    }
    const today = nowLocal().date;
    const date =
      params.date && isValidDate(params.date)
        ? params.date
        : today >= trip.startDate && today <= trip.endDate
          ? today
          : trip.startDate;
    const kind = params.kind && params.kind in KINDS ? (params.kind as EventKind) : 'drive';
    return blankEvent(kind, date);
  });

  const done = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/trip/[slug]', params: { slug } });

  return (
    <Screen>
      <EventForm
        trip={trip}
        initial={initial}
        submitLabel="Add to the plan"
        onCancel={done}
        onSubmit={async (input) => {
          await saveEvent(input);
          done();
        }}
      />
    </Screen>
  );
}
