import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { daysBetween, formatDayLong, formatTime } from '@/lib/dates';
import { isCompleted, type CompletedDay, type ItineraryDay, type ItineraryItem } from '@/lib/itinerary';
import { eventSubtitle, KINDS } from '@/lib/kinds';
import type { TripEvent } from '@/lib/types';

import { IconButton } from './button';
import { Icon } from './icon';
import { Card, IconTile } from './layout';
import { ThemedText } from './themed-text';

function openEvent(slug: string, event: TripEvent) {
  router.push({ pathname: '/trip/[slug]/event/[eventId]', params: { slug, eventId: event.id } });
}

function DoneMark() {
  const c = useTheme();
  return (
    <View style={styles.doneMark}>
      <Icon name="check" size={13} color={c.primary} />
      <ThemedText type="caption" themeColor="primary">
        Done
      </ThemedText>
    </View>
  );
}

export function EventRow({
  slug,
  item,
  allTravelers,
  done = false,
}: {
  slug: string;
  item: ItineraryItem;
  /** The trip's travelers, so a row can say who it is for when it isn't everyone. */
  allTravelers: string[];
  /** Already over: shown faded with a Done mark. */
  done?: boolean;
}) {
  const c = useTheme();
  const { event, part } = item;
  const k = KINDS[event.kind];

  if (part === 'end') {
    return (
      <Pressable
        onPress={() => openEvent(slug, event)}
        accessibilityRole="link"
        style={({ pressed }) => [styles.row, done && styles.done, pressed && { backgroundColor: c.backgroundElement }]}>
        <View style={styles.timeCol}>
          {item.time ? (
            <ThemedText type="smallBold" themeColor="textSecondary">
              {formatTime(item.time)}
            </ThemedText>
          ) : null}
          {done ? <DoneMark /> : null}
        </View>
        <View style={styles.endIcon}>
          <Icon name={k.icon} size={18} color={k.color} />
        </View>
        <View style={styles.body}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {k.endItemLabel}
            </ThemedText>
            {` · ${event.title}`}
            {k.places === 'route' && event.endLocation ? ` · ${event.endLocation}` : ''}
          </ThemedText>
        </View>
      </Pressable>
    );
  }

  const sameDayEnd = event.endTime && (!event.endDate || event.endDate === event.startDate) ? event.endTime : null;
  const nights = event.kind === 'lodging' && event.endDate ? daysBetween(event.startDate, event.endDate) : 0;
  const subtitle = [nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : '', eventSubtitle(event)]
    .filter(Boolean)
    .join(' · ');
  const includesEveryone =
    allTravelers.length > 0 &&
    allTravelers.every((t) => event.travelers.some((x) => x.toLowerCase() === t.toLowerCase()));
  const forSome = event.travelers.length > 0 && !includesEveryone;

  return (
    <Pressable
      onPress={() => openEvent(slug, event)}
      accessibilityRole="link"
      accessibilityLabel={`${k.label}: ${event.title}${item.time ? ` at ${formatTime(item.time)}` : ''}${done ? ', done' : ''}`}
      style={({ pressed }) => [styles.row, done && styles.done, pressed && { backgroundColor: c.backgroundElement }]}>
      <View style={styles.timeCol}>
        {item.time ? <ThemedText type="smallBold">{formatTime(item.time)}</ThemedText> : null}
        {sameDayEnd ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {formatTime(sameDayEnd)}
          </ThemedText>
        ) : null}
        {done ? <DoneMark /> : null}
      </View>
      <IconTile icon={k.icon} color={k.color} size={38} />
      <View style={styles.body}>
        <ThemedText type="heading" numberOfLines={2}>
          {event.title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
        {forSome ? (
          <View style={styles.forRow}>
            <Icon name="person" size={14} color={c.textSecondary} />
            <ThemedText type="caption" themeColor="textSecondary">
              {event.travelers.join(', ')}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <Icon name="chevronRight" size={20} color={c.textSecondary} style={styles.chevron} />
    </Pressable>
  );
}

export function DaySection({
  slug,
  day,
  isToday,
  isLastDay,
  tripHasLodging,
  allTravelers,
  now,
  onAdd,
}: {
  slug: string;
  day: ItineraryDay;
  /** The viewer's clock, to mark what is already over. */
  now: { date: string; time: string };
  isToday: boolean;
  isLastDay: boolean;
  /** Only nag about missing lodging on trips that track lodging at all. */
  tripHasLodging: boolean;
  allTravelers: string[];
  onAdd: (date: string) => void;
}) {
  const c = useTheme();
  const showNoLodging = tripHasLodging && day.dayNumber !== null && !isLastDay && day.tonight.length === 0;

  return (
    <View style={styles.day}>
      <View style={styles.dayHeader}>
        <View style={styles.flex}>
          <View style={styles.dayLabelRow}>
            <ThemedText type="label" themeColor={isToday ? 'primary' : 'textSecondary'}>
              {day.dayNumber ? `Day ${day.dayNumber}` : 'Outside trip dates'}
            </ThemedText>
            {isToday ? (
              <View style={[styles.todayPill, { backgroundColor: c.primary }]}>
                <ThemedText type="label" style={{ color: c.onPrimary, fontSize: 10.5 }}>
                  Today
                </ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText type="heading" accessibilityRole="header">
            {formatDayLong(day.date)}
          </ThemedText>
        </View>
        <IconButton icon="add" onPress={() => onAdd(day.date)} accessibilityLabel={`Add to ${formatDayLong(day.date)}`} />
      </View>

      <Card style={[styles.dayCard, isToday && { borderColor: c.primary }]}>
        {day.items.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            Nothing planned yet.
          </ThemedText>
        ) : (
          day.items.map((item, i) => (
            <View key={item.key}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
              <EventRow slug={slug} item={item} allTravelers={allTravelers} done={isCompleted(item.event, now)} />
            </View>
          ))
        )}

        {day.tonight.length > 0 || showNoLodging ? (
          <View style={[styles.tonight, { backgroundColor: c.backgroundElement }]}>
            <Icon name="moon" size={16} color={showNoLodging ? c.warning : c.textSecondary} />
            {showNoLodging ? (
              <ThemedText type="small" style={{ color: c.warning }}>
                No lodging booked for tonight
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                Tonight:{' '}
                {day.tonight.map((e, i) => (
                  <ThemedText
                    key={e.id}
                    type="smallBold"
                    themeColor="text"
                    onPress={() => openEvent(slug, e)}
                    accessibilityRole="link">
                    {i > 0 ? ', ' : ''}
                    {e.title}
                  </ThemedText>
                ))}
              </ThemedText>
            )}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

/** What has already happened, most recent day first. Each item opens its full details. */
export function CompletedDays({
  slug,
  days,
  allTravelers,
}: {
  slug: string;
  days: CompletedDay[];
  allTravelers: string[];
}) {
  const c = useTheme();
  return (
    <>
      {days.map((day) => (
        <View key={day.date} style={styles.day}>
          <View style={styles.dayHeader}>
            <View style={styles.flex}>
              <ThemedText type="label" themeColor="textSecondary">
                {day.dayNumber ? `Day ${day.dayNumber}` : 'Outside trip dates'}
              </ThemedText>
              <ThemedText type="heading" accessibilityRole="header">
                {formatDayLong(day.date)}
              </ThemedText>
            </View>
            <View style={styles.doneCount}>
              <Icon name="check" size={16} color={c.primary} />
              <ThemedText type="caption" themeColor="primary">
                {day.events.length} done
              </ThemedText>
            </View>
          </View>
          <Card style={styles.dayCard}>
            {day.events.map((event, i) => (
              <View key={event.id}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                <EventRow
                  slug={slug}
                  item={{ key: event.id, part: 'start', event, time: event.startTime }}
                  allTravelers={allTravelers}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  doneCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.two,
    paddingBottom: Spacing.one,
  },
  flex: {
    flex: 1,
  },
  day: {
    gap: Spacing.two,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingLeft: Spacing.one,
  },
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  todayPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  dayCard: {
    padding: Spacing.one,
    gap: 0,
    overflow: 'hidden',
  },
  empty: {
    padding: Spacing.three - 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64 + Spacing.three + 38,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingVertical: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  timeCol: {
    width: 64,
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  endIcon: {
    width: 38,
    alignItems: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  forRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: 2,
  },
  done: {
    opacity: 0.6,
  },
  doneMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  chevron: {
    marginLeft: Spacing.one,
  },
  tonight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.one,
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.small + 2,
  },
});
