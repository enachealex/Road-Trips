import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useState } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/button';
import { Icon } from '@/components/icon';
import { Toast } from '@/components/layout';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { unseenActivity } from '@/lib/activity';
import { shareLink, tripUrl } from '@/lib/share';
import { useLoadedTrip } from '@/lib/trip-context';

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon name={name} size={size} color={color} />;
  };
}

/** The trip's three sections: the plan, the group chat and the change history. */
export default function TripTabsLayout() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { slug, bundle, unreadCount, lastSeen, me } = useLoadedTrip();
  const [toast, setToast] = useState<string | null>(null);
  const unseen = unseenActivity(bundle.activity ?? [], lastSeen, me).length;

  const share = async () => {
    if ((await shareLink(bundle.trip.name, tripUrl(slug))) === 'copied') {
      setToast('Link copied. Paste it to your family.');
      setTimeout(() => setToast(null), 2200);
    }
  };

  return (
    <View style={styles.flex}>
      <Tabs
        screenOptions={{
          title: bundle.trip.name,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          headerLeft: () => (
            <View style={styles.headerLeft}>
              <IconButton icon="home" onPress={() => router.dismissTo('/')} accessibilityLabel="My trips" />
            </View>
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <IconButton icon="share" onPress={share} accessibilityLabel="Share this trip" />
              <IconButton
                icon="settings"
                onPress={() => router.push({ pathname: '/trip/[slug]/settings', params: { slug } })}
                accessibilityLabel="Share and settings"
              />
            </View>
          ),
          tabBarActiveTintColor: c.primary,
          tabBarInactiveTintColor: c.textSecondary,
          tabBarStyle: {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            height: 64 + insets.bottom,
            paddingTop: 4,
            paddingBottom: insets.bottom + 6,
          },
          tabBarLabelStyle: { fontWeight: '600', fontSize: 11.5, lineHeight: 15 },
          tabBarBadgeStyle: { backgroundColor: c.danger, color: '#FFFFFF', fontSize: 11 },
        }}>
        <Tabs.Screen name="index" options={{ tabBarLabel: 'Plan', tabBarIcon: tabIcon('calendar') }} />
        <Tabs.Screen
          name="messages"
          options={{
            tabBarLabel: 'Messenger',
            tabBarIcon: tabIcon('chat'),
            tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            tabBarLabel: 'Activity',
            tabBarIcon: tabIcon('history'),
            tabBarBadge: unseen > 0 ? (unseen > 99 ? '99+' : unseen) : undefined,
          }}
        />
      </Tabs>
      <Toast message={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerLeft: {
    marginLeft: Spacing.two,
  },
  headerRight: {
    flexDirection: 'row',
    gap: Spacing.one,
    marginRight: Spacing.two,
  },
});
