import { router } from 'expo-router';

import { Screen } from '@/components/layout';
import { TripForm } from '@/components/trip-form';
import { rememberTrip } from '@/lib/my-trips';
import { store } from '@/lib/store';

export default function NewTripScreen() {
  return (
    <Screen>
      <TripForm
        submitLabel="Create trip"
        onSubmit={async (input) => {
          const trip = await store.createTrip(input);
          rememberTrip(trip);
          router.replace({ pathname: '/trip/[slug]', params: { slug: trip.slug } });
        }}
      />
    </Screen>
  );
}
