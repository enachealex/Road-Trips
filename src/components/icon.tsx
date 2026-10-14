import { SymbolView } from 'expo-symbols';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Icons, type IconName } from '@/constants/icons';

/** A decorative icon. Screen readers skip it, so pair it with a text label or accessibilityLabel. */
export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View aria-hidden style={[{ width: size, height: size }, style]}>
      <SymbolView name={Icons[name]} size={size} tintColor={color} />
    </View>
  );
}
