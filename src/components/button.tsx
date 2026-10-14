import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/constants/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  loading = false,
  disabled = false,
  compact = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const colors = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary },
    secondary: { bg: c.surface, fg: c.text, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.dangerSoft, fg: c.danger, border: c.dangerSoft },
  }[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: colors.bg, borderColor: colors.border },
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.fg} />
      ) : icon ? (
        <Icon name={icon} size={compact ? 18 : 20} color={colors.fg} />
      ) : null}
      <ThemedText type="smallBold" style={{ color: colors.fg, fontSize: compact ? 14 : 15 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A round icon-only button, mostly for headers. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color,
  size = 22,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  size?: number;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: c.backgroundElement }]}>
      <View>
        <Icon name={icon} size={size} color={color ?? c.text} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    paddingHorizontal: Spacing.three + 2,
    borderRadius: Radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small + 2,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
