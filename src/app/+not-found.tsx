import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Card, Screen } from '@/components/layout';
import { ThemedText } from '@/components/themed-text';

export default function NotFoundScreen() {
  return (
    <Screen>
      <Card>
        <ThemedText type="subtitle">This page doesn’t exist</ThemedText>
        <ThemedText themeColor="textSecondary">
          If someone sent you a trip link, check that the whole link was copied.
        </ThemedText>
        <Button label="Go to my trips" variant="primary" icon="home" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
