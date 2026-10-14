import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/constants/icons';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

/** A scrolling page with content centred at a readable width. */
export function Screen({
  children,
  footer,
  contentStyle,
  ...scroll
}: ScrollViewProps & { children: ReactNode; footer?: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        {...scroll}>
        <View style={[styles.column, contentStyle]}>{children}</View>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="label" themeColor="textSecondary">
        {children}
      </ThemedText>
      {action}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  color,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Accent for the selected state; defaults to the theme's primary colour. */
  color?: string;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const accent = color ?? c.primary;
  const content = (
    <>
      {icon ? <Icon name={icon} size={16} color={selected ? accent : c.textSecondary} /> : null}
      <ThemedText type="smallBold" style={{ color: selected ? accent : c.text }}>
        {label}
      </ThemedText>
    </>
  );
  const chipStyle = [
    styles.chip,
    {
      backgroundColor: selected ? `${accent}1F` : c.surface,
      borderColor: selected ? accent : c.border,
    },
  ];
  if (!onPress) return <View style={chipStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [...chipStyle, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  );
}

export function Banner({
  icon,
  tone = 'info',
  children,
  action,
}: {
  icon: IconName;
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
  action?: ReactNode;
}) {
  const c = useTheme();
  const palette = {
    info: { bg: c.primarySoft, fg: c.primary },
    warning: { bg: c.warningSoft, fg: c.warning },
    danger: { bg: c.dangerSoft, fg: c.danger },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} accessibilityRole="summary">
      <Icon name={icon} size={20} color={palette.fg} style={styles.bannerIcon} />
      <View style={styles.flex}>
        {typeof children === 'string' ? (
          <ThemedText type="small" style={{ color: c.text }}>
            {children}
          </ThemedText>
        ) : (
          children
        )}
      </View>
      {action}
    </View>
  );
}

/** A two-or-more-way switch, like "Upcoming | Completed". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.backgroundElement }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: c.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A coloured rounded square holding an icon, used for event kinds. */
export function IconTile({ icon, color, size = 40 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: `${color}1F`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={icon} size={size * 0.55} color={color} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/**
 * Pins its children to the bottom of the screen, lined up with the right edge of the
 * content column. Pass as a Screen's `footer`.
 */
export function BottomDock({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: insets.bottom + Spacing.three }]}>
      <View pointerEvents="box-none" style={styles.dockInner}>
        {children}
      </View>
    </View>
  );
}

/** The round "+" button that floats over a list. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { backgroundColor: c.primary }, pressed && { opacity: 0.85 }]}>
      <Icon name="add" size={22} color={c.onPrimary} />
      <ThemedText type="smallBold" style={{ color: c.onPrimary, fontSize: 15 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A short message that floats at the bottom of the screen, e.g. "Link copied". */
export function Toast({ message }: { message: string | null }) {
  const c = useTheme();
  if (!message) return null;
  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      <View style={[styles.toast, { backgroundColor: c.text }]} accessibilityLiveRegion="polite" role="status">
        <ThemedText type="smallBold" style={{ color: c.background }}>
          {message}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six + Spacing.five,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
    minHeight: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    minHeight: 36,
    paddingHorizontal: Spacing.three - 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two + 2,
    padding: Spacing.three - 4,
    borderRadius: Radius.medium,
  },
  bannerIcon: {
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.medium,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small + 1,
    paddingHorizontal: Spacing.two,
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  dockInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignItems: 'flex-end',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 52,
    paddingHorizontal: Spacing.four - 4,
    borderRadius: Radius.pill,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.22)',
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.six + Spacing.four,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.pill,
  },
});
