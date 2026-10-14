import { router } from 'expo-router';

import { Screen } from '@/components/layout';
import { TripForm } from '@/components/trip-form';
import { rememberTrip, writeIdentity } from '@/lib/my-trips';
import { store } from '@/lib/store';

export default function NewTripScreen() {
  return (
    <Screen>
      <TripForm
        askOrganizer
        submitLabel="Create trip"
        onSubmit={async (input, organizer) => {
          const trip = await store.createTrip(input, organizer);
          writeIdentity(trip.slug, organizer);
          rememberTrip(trip);
          router.replace({ pathname: '/trip/[slug]', params: { slug: trip.slug } });
        }}
      />
    </Screen>
  );
}
