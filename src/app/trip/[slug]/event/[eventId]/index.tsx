import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/button';
import { useConfirm } from '@/components/confirm-dialog';
import { Icon } from '@/components/icon';
import { Banner, Card, IconTile, Row, Screen } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween, formatDayLong, formatRelative, formatTime } from '@/lib/dates';
import { KINDS, mapQuery } from '@/lib/kinds';
import { directionsUrl, flightStatusUrl, mapsSearchUrl, normalizeUrl, telUrl } from '@/lib/links';
import { copyText } from '@/lib/share';
import { errorMessage } from '@/lib/store';
import { useLoadedTrip } from '@/lib/trip-context';

function Section({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={styles.section}>
      <Icon name={icon} size={20} color={c.textSecondary} style={styles.sectionIcon} />
      <View style={styles.flex}>
        <ThemedText type="label" themeColor="textSecondary">
          {label}
        </ThemedText>
        {children}
      </View>
    </View>
  );
}

function open(url: string) {
  void Linking.openURL(url);
}

export default function EventDetailScreen() {
  const confirm = useConfirm();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { slug, bundle, deleteEvent, restoreEvent } = useLoadedTrip();
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const event = bundle.events.find((e) => e.id === eventId);
  const deleted = event ? undefined : bundle.deletedEvents.find((e) => e.id === eventId);
  useDocumentTitle(event ? `${event.title} · ${bundle.trip.name}` : bundle.trip.name);
  const backToTrip = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/trip/[slug]', params: { slug } });

  if (!event) {
    return (
      <Screen>
        <Card>
          <ThemedText type="subtitle">{deleted ? `“${deleted.title}” was deleted` : 'This item isn’t in the trip'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {deleted
              ? `${deleted.updatedBy ? `${deleted.updatedBy} deleted it` : 'It was deleted'} ${formatRelative(deleted.deletedAt!)}.`
              : 'Someone may have deleted it.'}
          </ThemedText>
          {failure ? <Banner icon="warning" tone="danger">{failure}</Banner> : null}
          <Row>
            {deleted ? (
              <Button
                label="Restore it"
                icon="restore"
                variant="primary"
                onPress={async () => {
                  try {
                    await restoreEvent(deleted.id);
                  } catch (e) {
                    setFailure(errorMessage(e));
                  }
                }}
              />
            ) : null}
            <Button label="Back to the trip" onPress={backToTrip} />
          </Row>
        </Card>
      </Screen>
    );
  }

  const k = KINDS[event.kind];
  const spansDays = !!event.endDate && event.endDate !== event.startDate;
  const nights = event.kind === 'lodging' && event.endDate ? daysBetween(event.startDate, event.endDate) : 0;
  const details = k.details.filter((f) => event.details[f.key]);
  const hasPlace = k.places === 'place' && (event.location || event.address || event.kind === 'lodging');

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${event.title}”?`,
      message: 'It disappears for everyone. You can restore it from Share & settings for 30 days.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteEvent(event.id);
      backToTrip();
    } catch (e) {
      setFailure(errorMessage(e));
    }
  };

  const edit = () =>
    router.push({ pathname: '/trip/[slug]/event/[eventId]/edit', params: { slug, eventId: event.id } });

  return (
    <>
      <Stack.Screen
        options={{
          title: k.label,
          headerRight: () => <IconButton icon="edit" onPress={edit} accessibilityLabel="Edit" />,
        }}
      />
      <Screen>
        <Card>
          <View style={styles.header}>
            <IconTile icon={k.icon} color={k.color} size={52} />
            <View style={styles.flex}>
              <ThemedText type="label" style={{ color: k.color }}>
                {k.label}
                {nights > 0 ? ` · ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}
              </ThemedText>
              <ThemedText type="subtitle">{event.title}</ThemedText>
            </View>
          </View>

          <Section icon="clock" label={spansDays ? k.startLabel : 'When'}>
            <ThemedText type="heading">
              {formatDayLong(event.startDate)}
              {event.startTime ? ` · ${formatTime(event.startTime)}` : ''}
              {!spansDays && event.endTime ? ` – ${formatTime(event.endTime)}` : ''}
            </ThemedText>
          </Section>
          {spansDays ? (
            <Section icon="clock" label={k.endLabel}>
              <ThemedText type="heading">
                {formatDayLong(event.endDate!)}
                {event.endTime ? ` · ${formatTime(event.endTime)}` : ''}
              </ThemedText>
            </Section>
          ) : null}

          {k.places === 'route' && (event.location || event.endLocation) ? (
            <Section icon="pin" label="Route">
              {event.location ? (
                <ThemedText type="heading">
                  <ThemedText themeColor="textSecondary">{`${k.fromLabel}: `}</ThemedText>
                  {event.location}
                </ThemedText>
              ) : null}
              {event.endLocation ? (
                <ThemedText type="heading">
                  <ThemedText themeColor="textSecondary">{`${k.toLabel}: `}</ThemedText>
                  {event.endLocation}
                </ThemedText>
              ) : null}
              <Row style={styles.actions}>
                {event.endLocation ? (
                  <Button
                    label="Directions"
                    icon="directions"
                    compact
                    onPress={() =>
                      open(
                        directionsUrl(
                          event.location,
                          event.endLocation,
                          event.kind === 'drive' || event.kind === 'car_rental' ? 'driving' : 'transit',
                        ),
                      )
                    }
                  />
                ) : null}
                {event.location ? (
                  <Button label="Map" icon="map" compact onPress={() => open(mapsSearchUrl(event.location))} />
                ) : null}
              </Row>
            </Section>
          ) : null}

          {hasPlace ? (
            <Section icon="pin" label="Where">
              {event.location && event.location !== event.title ? (
                <ThemedText type="heading">{event.location}</ThemedText>
              ) : null}
              {event.address ? <ThemedText selectable>{event.address}</ThemedText> : null}
              <Row style={styles.actions}>
                <Button label="Open in Maps" icon="map" compact onPress={() => open(mapsSearchUrl(mapQuery(event)))} />
                <Button
                  label="Directions"
                  icon="directions"
                  compact
                  onPress={() => open(directionsUrl('', mapQuery(event)))}
                />
              </Row>
            </Section>
          ) : null}

          <Section icon="people" label="Who">
            <ThemedText type="heading">{event.travelers.length ? event.travelers.join(', ') : 'Everyone'}</ThemedText>
          </Section>
        </Card>

        {details.length > 0 || event.confirmation || event.phone || event.url ? (
          <Card>
            {details.map((f) => (
              <View key={f.key} style={styles.detailRow}>
                <ThemedText themeColor="textSecondary">{f.label}</ThemedText>
                <ThemedText type="heading" selectable style={styles.detailValue}>
                  {event.details[f.key]}
                </ThemedText>
              </View>
            ))}
            {event.kind === 'flight' && event.details.flightNumber ? (
              <Button
                label="Check flight status"
                icon="flight"
                compact
                onPress={() => open(flightStatusUrl(event.details.airline ?? '', event.details.flightNumber))}
              />
            ) : null}
            {event.confirmation ? (
              <View style={styles.detailRow}>
                <ThemedText themeColor="textSecondary">Confirmation</ThemedText>
                <View style={styles.confirmation}>
                  <ThemedText type="code" selectable>
                    {event.confirmation}
                  </ThemedText>
                  <IconButton
                    icon={copied ? 'check' : 'copy'}
                    size={18}
                    accessibilityLabel="Copy confirmation number"
                    onPress={() => {
                      void copyText(event.confirmation).then((ok) => {
                        setCopied(ok);
                        if (ok) setTimeout(() => setCopied(false), 1500);
                      });
                    }}
                  />
                </View>
              </View>
            ) : null}
            {event.phone ? (
              <Button label={`Call ${event.phone}`} icon="call" compact onPress={() => open(telUrl(event.phone))} />
            ) : null}
            {event.url ? (
              <Button label="Open link" icon="openExternal" compact onPress={() => open(normalizeUrl(event.url))} />
            ) : null}
          </Card>
        ) : null}

        {event.notes ? (
          <Card>
            <ThemedText type="label" themeColor="textSecondary">
              Notes
            </ThemedText>
            <ThemedText selectable>{event.notes}</ThemedText>
          </Card>
        ) : null}

        {failure ? <Banner icon="warning" tone="danger">{failure}</Banner> : null}

        <Row>
          <Button label="Edit" icon="edit" variant="primary" onPress={edit} style={styles.flex} />
          <Button
            label="Duplicate"
            icon="duplicate"
            onPress={() => router.push({ pathname: '/trip/[slug]/event/new', params: { slug, copy: event.id } })}
            style={styles.flex}
          />
          <Button label="Delete" icon="delete" variant="danger" onPress={remove} style={styles.flex} />
        </Row>

        <ThemedText type="caption" themeColor="textSecondary" style={styles.footnote}>
          {event.updatedBy ? `Last changed by ${event.updatedBy} ` : 'Last changed '}
          {formatRelative(event.updatedAt)}
        </ThemedText>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  section: {
    flexDirection: 'row',
    gap: Spacing.three - 4,
  },
  sectionIcon: {
    marginTop: 2,
  },
  actions: {
    marginTop: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 32,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  confirmation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  footnote: {
    textAlign: 'center',
  },
});
