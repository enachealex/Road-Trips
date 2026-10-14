import type { CSSProperties } from 'react';

import { Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

import type { DateTimeInputProps } from './date-time-input';

// The browser's own pickers: a calendar for dates and a clock field for times. Both
// report values in the same "YYYY-MM-DD" / "HH:MM" format the trip data uses.

function useInputStyle(invalid?: boolean): CSSProperties {
  const c = useTheme();
  const scheme = useColorScheme();
  return {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 46,
    border: `1px solid ${invalid ? c.danger : c.border}`,
    borderRadius: Radius.medium,
    padding: `0 ${Spacing.three - 4}px`,
    fontSize: 16,
    fontFamily: 'inherit',
    color: c.text,
    backgroundColor: c.surface,
    colorScheme: scheme === 'dark' ? 'dark' : 'light',
  };
}

export function DateInput({ value, onChange, accessibilityLabel, invalid, min }: DateTimeInputProps) {
  const style = useInputStyle(invalid);
  return (
    <input
      type="date"
      value={value}
      min={min}
      aria-label={accessibilityLabel}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    />
  );
}

export function TimeInput({ value, onChange, accessibilityLabel, invalid }: DateTimeInputProps) {
  const style = useInputStyle(invalid);
  return (
    <input
      type="time"
      value={value}
      aria-label={accessibilityLabel}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    />
  );
}
