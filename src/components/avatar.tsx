import { View } from 'react-native';

import { initials, personColor } from '@/lib/people';

import { ThemedText } from './themed-text';

/** A coloured circle with someone's initials. The colour stays the same for the same name. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: personColor(name || '?'),
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <ThemedText style={{ color: '#FFFFFF', fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: '700' }}>
        {initials(name || '?')}
      </ThemedText>
    </View>
  );
}
