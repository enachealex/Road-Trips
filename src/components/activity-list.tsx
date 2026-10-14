import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeActivity } from '@/lib/activity';
import { formatRelative } from '@/lib/dates';
import type { ActivityEntry } from '@/lib/types';

import { Avatar } from './avatar';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

function openEntry(slug: string, entry: ActivityEntry) {
  if (entry.eventId) {
    router.push({ pathname: '/trip/[slug]/event/[eventId]', params: { slug, eventId: entry.eventId } });
  }
}

/** One change: "Dad changed Dinner", what changed, and when. Tapping opens the item. */
export function ActivityItem({
  slug,
  entry,
  showAvatar = true,
  linkEvents = true,
}: {
  slug: string;
  entry: ActivityEntry;
  showAvatar?: boolean;
  linkEvents?: boolean;
}) {
  const c = useTheme();
  const { text, details } = describeActivity(entry);
  const linked = linkEvents && !!entry.eventId;
  return (
    <Pressable
      onPress={linked ? () => openEntry(slug, entry) : undefined}
      disabled={!linked}
      accessibilityRole={linked ? 'link' : undefined}
      style={({ pressed }) => [styles.item, pressed && linked && { backgroundColor: c.backgroundElement }]}>
      {showAvatar ? <Avatar name={entry.actor || '?'} size={32} /> : null}
      <View style={styles.body}>
        <ThemedText type="smallBold">{text}</ThemedText>
        {details.map((d, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary">
            {d}
          </ThemedText>
        ))}
        <ThemedText type="caption" themeColor="textSecondary">
          {formatRelative(entry.at)}
        </ThemedText>
      </View>
      {linked ? <Icon name="chevronRight" size={18} color={c.textSecondary} style={styles.chevron} /> : null}
    </Pressable>
  );
}

export function ActivityList({
  slug,
  entries,
  showAvatars = true,
  linkEvents = true,
}: {
  slug: string;
  entries: ActivityEntry[];
  showAvatars?: boolean;
  /** Off on an item's own page, where linking to itself would go nowhere. */
  linkEvents?: boolean;
}) {
  const c = useTheme();
  return (
    <View>
      {entries.map((entry, i) => (
        <View key={entry.id}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
          <ActivityItem slug={slug} entry={entry} showAvatar={showAvatars} linkEvents={linkEvents} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three - 4,
    padding: Spacing.three - 4,
    borderRadius: 12,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  chevron: {
    alignSelf: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three - 4,
  },
});
