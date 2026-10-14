import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Banner, Card, Screen, SectionTitle } from '@/components/layout';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateRange, nowLocal } from '@/lib/dates';
import { tripLength, tripStatus } from '@/lib/itinerary';
import { slugFromInput } from '@/lib/links';
import { getMyTrips, rememberTrip, type SavedTrip } from '@/lib/my-trips';
import { buildSampleTrip } from '@/lib/sample-trip';
import { errorMessage, isDemoMode, store } from '@/lib/store';

function statusText(trip: SavedTrip, today: string): string {
  const s = tripStatus(trip, today);
  if (s.phase === 'upcoming') return s.daysUntil === 1 ? 'Starts tomorrow' : `Starts in ${s.daysUntil} days`;
  if (s.phase === 'ongoing') return `Day ${s.dayNumber} of ${tripLength(trip)}`;
  return 'Ended';
}

/** Trips happening now first, then upcoming soonest-first, then past trips most recent first. */
function sortTrips(trips: SavedTrip[], today: string): SavedTrip[] {
  const rank = (t: SavedTrip) => (t.startDate <= today && today <= t.endDate ? 0 : t.startDate > today ? 1 : 2);
  return [...trips].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return rank(a) === 2 ? b.endDate.localeCompare(a.endDate) : a.startDate.localeCompare(b.startDate);
  });
}

function TripRow({ trip, today }: { trip: SavedTrip; today: string }) {
  const c = useTheme();
  const ongoing = trip.startDate <= today && today <= trip.endDate;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trip/[slug]', params: { slug: trip.slug } })}
      accessibilityRole="link"
      style={({ pressed }) => [styles.tripRow, pressed && { backgroundColor: c.backgroundElement }]}>
      <View style={[styles.tripIcon, { backgroundColor: ongoing ? c.primary : c.primarySoft }]}>
        <Icon name="drive" size={22} color={ongoing ? c.onPrimary : c.primary} />
      </View>
      <View style={styles.flex}>
        <ThemedText type="heading" numberOfLines={1}>
          {trip.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDateRange(trip.startDate, trip.endDate)}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" themeColor={ongoing ? 'primary' : 'textSecondary'}>
        {statusText(trip, today)}
      </ThemedText>
      <Icon name="chevronRight" size={20} color={c.textSecondary} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const c = useTheme();
  const [trips, setTrips] = useState<SavedTrip[]>(() => getMyTrips());
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const today = nowLocal().date;

  useFocusEffect(useCallback(() => setTrips(getMyTrips()), []));

  const openLink = () => {
    const slug = slugFromInput(link);
    if (!slug) {
      setLinkError('Paste the whole link someone sent you, or just the code at the end of it.');
      return;
    }
    setLinkError(null);
    setLink('');
    router.push({ pathname: '/trip/[slug]', params: { slug } });
  };

  const openSample = async () => {
    setSampleBusy(true);
    setSampleError(null);
    try {
      const sample = buildSampleTrip();
      const trip = await store.createTrip(sample.trip, sample.organizer);
      const saved = await Promise.all(sample.events.map((e) => store.saveEvent(trip.slug, e)));
      const idByTitle = new Map(saved.map((e) => [e.title, e.id]));
      for (const m of sample.messages) {
        await store.postMessage(trip.slug, {
          body: m.body,
          by: m.by,
          eventId: m.about ? (idByTitle.get(m.about) ?? null) : null,
        });
      }
      rememberTrip(trip);
      router.push({ pathname: '/trip/[slug]', params: { slug: trip.slug } });
    } catch (e) {
      setSampleError(errorMessage(e));
    } finally {
      setSampleBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={[styles.logo, { backgroundColor: c.primary }]}>
          <Icon name="map" size={30} color={c.onPrimary} />
        </View>
        <ThemedText type="title" accessibilityRole="header">
          Roadbook
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.tagline}>
          Every flight, drive and hotel for the whole family, laid out day by day. Share one link and everyone
          knows the plan.
        </ThemedText>
      </View>

      {isDemoMode ? (
        <Banner icon="warning" tone="warning">
          Demo mode: no server is connected, so trips are saved only in this browser and can’t be shared yet.
        </Banner>
      ) : null}

      <Button label="Plan a new trip" icon="add" variant="primary" onPress={() => router.push('/new-trip')} />

      {trips.length > 0 ? (
        <>
          <SectionTitle>Your trips</SectionTitle>
          <Card style={styles.list}>
            {sortTrips(trips, today).map((trip, i) => (
              <View key={trip.slug}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                <TripRow trip={trip} today={today} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>Got a link from family?</SectionTitle>
      <Card>
        <TextField
          label="Trip link or code"
          value={link}
          onChangeText={(v) => {
            setLink(v);
            setLinkError(null);
          }}
          onSubmitEditing={openLink}
          placeholder="https://roadtrip.thejumpvault.com/trip/…"
          autoCapitalize="none"
          autoCorrect={false}
          error={linkError}
        />
        <Button label="Open trip" onPress={openLink} disabled={!link.trim()} />
      </Card>

      <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
        <View style={styles.sampleRow}>
          <Icon name="sparkles" size={22} color={c.primary} />
          <View style={styles.flex}>
            <ThemedText type="heading">See how it works</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Open a 12-day sample road trip with flights, hotels and drives. It’s yours to poke at or delete.
            </ThemedText>
          </View>
        </View>
        {sampleError ? (
          <ThemedText type="caption" themeColor="danger">
            {sampleError}
          </ThemedText>
        ) : null}
        <Button label="Open a sample trip" onPress={openSample} loading={sampleBusy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hero: {
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  tagline: {
    maxWidth: 520,
  },
  list: {
    padding: Spacing.one,
    gap: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44 + Spacing.three * 2 - 4,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  tripIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleRow: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
});
