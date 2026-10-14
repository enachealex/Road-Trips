import { StyleSheet, TextInput } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Native fallback: typed entry with a format hint. The web build uses the browser's own
// date and time pickers (date-time-input.web.tsx).

export interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  invalid?: boolean;
  min?: string;
}

function useInputStyle(invalid?: boolean) {
  const c = useTheme();
  return [styles.input, { backgroundColor: c.surface, borderColor: invalid ? c.danger : c.border, color: c.text }];
}

export function DateInput({ value, onChange, accessibilityLabel, invalid }: DateTimeInputProps) {
  const style = useInputStyle(invalid);
  const c = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={c.textSecondary}
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}

export function TimeInput({ value, onChange, accessibilityLabel, invalid }: DateTimeInputProps) {
  const style = useInputStyle(invalid);
  const c = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM (24h)"
      placeholderTextColor={c.textSecondary}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three - 4,
    fontSize: 16,
  },
});
