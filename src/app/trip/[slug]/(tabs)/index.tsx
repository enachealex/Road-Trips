import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { CompletedDays, DaySection } from '@/components/itinerary';
import { Banner, BottomDock, Card, Chip, Fab, IconTile, Row, Screen, Segmented, Toast } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useTheme } from '@/hooks/use-theme';
import { unseenActivity } from '@/lib/activity';
import { formatDateRange, formatDayShort, formatRelative, formatTime, nowLocal, pluralDays } from '@/lib/dates';
import { buildCompleted, buildItinerary, findNextUp, tripLength, tripStatus, type ItineraryItem } from '@/lib/itinerary';
import { eventSubtitle, KINDS } from '@/lib/kinds';
import { shareLink, tripUrl } from '@/lib/share';
import { useLoadedTrip } from '@/lib/trip-context';

function useFlash(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);
  return [
    message,
    (next) => {
      setMessage(next);
      clearTimeout(timer.current ?? undefined);
      timer.current = setTimeout(() => setMessage(null), 2200);
    },
  ];
}

/** The viewer's clock, ticking each minute so "next up" moves along during the day. */
function useNow() {
  const [now, setNow] = useState(() => nowLocal());
  useEffect(() => {
    const id = setInterval(() => setNow(nowLocal()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function NextUp({ slug, date, item, today }: { slug: string; date: string; item: ItineraryItem; today: string }) {
  const c = useTheme();
  const k = KINDS[item.event.kind];
  const when = [date === today ? 'Today' : formatDayShort(date), item.time ? formatTime(item.time) : null]
    .filter(Boolean)
    .join(' · ');
  const title = item.part === 'end' ? `${k.endItemLabel} · ${item.event.title}` : item.event.title;
  const subtitle = item.part === 'start' ? eventSubtitle(item.event) : '';

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/trip/[slug]/event/[eventId]', params: { slug, eventId: item.event.id } })
      }
      accessibilityRole="link"
      accessibilityLabel={`Next up: ${title}, ${when}`}
      style={({ pressed }) => [
        styles.nextUp,
        { backgroundColor: c.primarySoft, borderColor: c.primary },
        pressed && { opacity: 0.8 },
      ]}>
      <IconTile icon={k.icon} color={k.color} size={44} />
      <View style={styles.flex}>
        <ThemedText type="label" themeColor="primary">
          Next up · {when}
        </ThemedText>
        <ThemedText type="heading" numberOfLines={2}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Icon name="chevronRight" size={20} color={c.primary} />
    </Pressable>
  );
}

export default function ItineraryScreen() {
  const c = useTheme();
  const { slug, bundle, traveler, setTraveler, offlineSince, refresh, refreshing, me, chooseIdentity, lastSeen, markSeen } =
    useLoadedTrip();
  const { trip, events } = bundle;
  useDocumentTitle(`${trip.name} · Roadbook`);
  const now = useNow();
  const [flash, setFlash] = useFlash();
  const [showPast, setShowPast] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // A filter for someone who was later removed from the trip shouldn't hide everything.
  const activeTraveler = traveler && trip.travelers.some((t) => t.toLowerCase() === traveler.toLowerCase()) ? traveler : null;
  const days = useMemo(() => buildItinerary(trip, events, activeTraveler), [trip, events, activeTraveler]);
  const status = tripStatus(trip, now.date);
  const next =
    status.phase === 'ongoing' || (status.phase === 'upcoming' && status.daysUntil <= 1) ? findNextUp(days, now) : null;
  const pastDays = status.phase === 'ongoing' ? days.filter((d) => d.date < now.date) : [];
  const visibleDays = showPast ? days : days.slice(pastDays.length);
  const tripHasLodging = events.some((e) => e.kind === 'lodging');
  const length = tripLength(trip);
  // Roughly more than three lines on a phone; shorter notes are shown in full.
  const longNotes = trip.notes.length > 160 || trip.notes.split('\n').length > 3;
  const unseen = unseenActivity(bundle.activity ?? [], lastSeen, me);
  const completed = useMemo(
    () => buildCompleted(trip, events, now, activeTraveler),
    [trip, events, now, activeTraveler],
  );
  const completedCount = completed.reduce((n, d) => n + d.events.length, 0);
  // Once the trip is over, open on what happened.
  const [view, setView] = useState<'upcoming' | 'completed'>(() =>
    tripStatus(trip, nowLocal().date).phase === 'past' ? 'completed' : 'upcoming',
  );

  const share = async () => {
    const result = await shareLink(trip.name, tripUrl(slug));
    if (result === 'copied') setFlash('Link copied. Paste it to your family.');
  };
  const addEvent = (date?: string) =>
    router.push({ pathname: '/trip/[slug]/event/new', params: date ? { slug, date } : { slug } });

  const statusLine =
    status.phase === 'upcoming'
      ? status.daysUntil === 1
        ? 'Starts tomorrow'
        : `Starts in ${pluralDays(status.daysUntil)}`
      : status.phase === 'ongoing'
        ? `Day ${status.dayNumber} of ${length}`
        : 'This trip has ended';

  return (
    <>
      <Screen
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        footer={
          <>
            <BottomDock>
              <Fab label="Add" onPress={() => addEvent()} />
            </BottomDock>
            <Toast message={flash} />
          </>
        }>
        {offlineSince ? (
          <Banner icon="offline" tone="warning" action={<Button label="Retry" compact onPress={refresh} />}>
            {`You’re offline. Showing the copy saved ${formatRelative(offlineSince)}.`}
          </Banner>
        ) : null}

        <Card>
          <View style={styles.summaryTop}>
            <View style={styles.flex}>
              <ThemedText type="label" themeColor={status.phase === 'ongoing' ? 'primary' : 'textSecondary'}>
                {statusLine}
              </ThemedText>
              <ThemedText type="subtitle">{trip.name}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {formatDateRange(trip.startDate, trip.endDate)} · {pluralDays(length)}
              </ThemedText>
            </View>
          </View>
          {trip.travelers.length > 0 ? (
            <View style={styles.inline}>
              <Icon name="people" size={18} color={c.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {trip.travelers.join(', ')}
              </ThemedText>
            </View>
          ) : null}
          <View style={[styles.inline, styles.me]}>
            {me ? <Avatar name={me} size={24} /> : <Icon name="person" size={18} color={c.textSecondary} />}
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {me ? (
                <>
                  You’re <ThemedText type="smallBold">{me}</ThemedText> on this device
                </>
              ) : (
                'You haven’t said who you are yet'
              )}
            </ThemedText>
            <Button label={me ? 'Switch' : 'Choose'} compact variant="ghost" onPress={() => void chooseIdentity()} />
          </View>
          {trip.notes && longNotes ? (
            <Pressable
              onPress={() => setNotesOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: notesOpen }}>
              <ThemedText type="small" numberOfLines={notesOpen ? undefined : 3}>
                {trip.notes}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="primary" style={styles.more}>
                {notesOpen ? 'Show less' : 'Show more'}
              </ThemedText>
            </Pressable>
          ) : trip.notes ? (
            <ThemedText type="small">{trip.notes}</ThemedText>
          ) : null}
        </Card>

        {unseen.length > 0 ? (
          <Card style={{ borderColor: c.primary }}>
            <View style={styles.inline}>
              <Icon name="history" size={18} color={c.primary} />
              <ThemedText type="label" themeColor="primary" style={styles.flex}>
                {`Since you last looked · ${unseen.length} ${unseen.length === 1 ? 'change' : 'changes'}`}
              </ThemedText>
            </View>
            <ActivityList slug={slug} entries={unseen.slice(0, 3)} />
            <Row>
              {unseen.length > 3 ? (
                <Button
                  label={`See all ${unseen.length}`}
                  compact
                  onPress={() => router.navigate({ pathname: '/trip/[slug]/activity', params: { slug } })}
                />
              ) : null}
              <Button label="Got it" compact variant="ghost" icon="check" onPress={markSeen} />
            </Row>
          </Card>
        ) : null}

        {next ? <NextUp slug={slug} date={next.day.date} item={next.item} today={now.date} /> : null}

        {trip.travelers.length > 0 ? (
          <View style={styles.filter}>
            <ThemedText type="label" themeColor="textSecondary">
              Show the plan for
            </ThemedText>
            <Row>
              <Chip label="Everyone" icon="people" selected={!activeTraveler} onPress={() => setTraveler(null)} />
              {trip.travelers.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={activeTraveler === name}
                  onPress={() => setTraveler(activeTraveler === name ? null : name)}
                />
              ))}
            </Row>
          </View>
        ) : null}

        {events.length === 0 ? (
          <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primarySoft }}>
            <ThemedText type="heading">Start the plan</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Add flights, drives, hotels and anything else, on the day they happen. Then share the link: anyone who
              has it can see the plan and help fill it in.
            </ThemedText>
            <Row>
              <Button label="Add the first plan" icon="add" variant="primary" onPress={() => addEvent()} />
              <Button label="Share the link" icon="share" onPress={share} />
            </Row>
          </Card>
        ) : null}

        {events.length > 0 ? (
          <Segmented
            options={[
              { value: 'upcoming', label: status.phase === 'past' ? 'Day by day' : 'Upcoming' },
              { value: 'completed', label: completedCount ? `Completed · ${completedCount}` : 'Completed' },
            ]}
            value={view}
            onChange={setView}
          />
        ) : null}

        {view === 'completed' ? (
          completed.length > 0 ? (
            <CompletedDays slug={slug} days={completed} allTravelers={trip.travelers} />
          ) : (
            <Card>
              <ThemedText type="heading">Nothing completed yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Flights, drives, stays and plans move here once they’re over, so everyone can look back at what
                happened and find the details later.
              </ThemedText>
            </Card>
          )
        ) : (
          <>
            {pastDays.length > 0 ? (
              <Button
                label={
                  showPast
                    ? 'Hide earlier days'
                    : `Show ${pastDays.length} earlier ${pastDays.length === 1 ? 'day' : 'days'}`
                }
                icon={showPast ? 'chevronDown' : 'calendar'}
                variant="ghost"
                onPress={() => setShowPast((s) => !s)}
              />
            ) : null}

            {visibleDays.map((day) => (
              <DaySection
                key={day.date}
                slug={slug}
                day={day}
                isToday={day.date === now.date}
                isLastDay={day.date === trip.endDate}
                tripHasLodging={tripHasLodging}
                allTravelers={trip.travelers}
                now={now}
                onAdd={addEvent}
              />
            ))}
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  summaryTop: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  me: {
    marginTop: -Spacing.one,
  },
  more: {
    marginTop: Spacing.one,
  },
  nextUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    padding: Spacing.three - 2,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  filter: {
    gap: Spacing.two,
  },
});
