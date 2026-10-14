import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={styles.labelRow}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {hint ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function TextField({
  label,
  hint,
  error,
  multiline,
  style,
  containerStyle,
  ...input
}: TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  /** Layout for the label + input block, e.g. sizing inside a row of fields. */
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  return (
    <View style={[styles.field, containerStyle]}>
      <FieldLabel label={label} hint={hint} />
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textSecondary}
        multiline={multiline}
        style={[
          styles.input,
          { backgroundColor: c.surface, borderColor: error ? c.danger : c.border, color: c.text },
          multiline && styles.multiline,
          style,
        ]}
        {...input}
      />
      {error ? (
        <ThemedText type="caption" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one + 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
