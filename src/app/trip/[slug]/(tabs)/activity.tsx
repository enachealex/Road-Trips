import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';

import { ActivityList } from '@/components/activity-list';
import { Card, Screen, SectionTitle } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';
import { dayLabel } from '@/lib/dates';
import { useLoadedTrip } from '@/lib/trip-context';
import type { ActivityEntry } from '@/lib/types';

function groupByDay(entries: ActivityEntry[]): { label: string; entries: ActivityEntry[] }[] {
  const groups: { label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

/** Everything that has been added, changed, deleted or restored, newest first. */
export default function ActivityScreen() {
  const { slug, bundle, markSeen, refresh, refreshing } = useLoadedTrip();
  const entries = bundle.activity ?? [];

  // Looking at this tab counts as catching up.
  useFocusEffect(
    useCallback(() => {
      markSeen();
    }, [markSeen]),
  );

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {entries.length === 0 ? (
        <Card>
          <ThemedText type="heading">No changes yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Whenever someone adds, changes or deletes something in the plan, it shows up here with their name.
          </ThemedText>
        </Card>
      ) : (
        groupByDay(entries).map((group) => (
          <Card key={group.label} style={{ padding: 4, gap: 0 }}>
            <View style={{ paddingHorizontal: 12 }}>
              <SectionTitle>{group.label}</SectionTitle>
            </View>
            <ActivityList slug={slug} entries={group.entries} />
          </Card>
        ))
      )}
      {entries.length >= 80 ? (
        <ThemedText type="caption" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Showing the latest 80 changes.
        </ThemedText>
      ) : null}
    </Screen>
  );
}
