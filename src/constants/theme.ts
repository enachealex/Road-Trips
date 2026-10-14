import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1D1C1A',
    textSecondary: '#66625B',
    background: '#F5F3EF',
    surface: '#FFFFFF',
    backgroundElement: '#ECE9E3',
    backgroundSelected: '#DEDAD2',
    border: '#E2DED6',
    primary: '#0D6E61',
    onPrimary: '#FFFFFF',
    primarySoft: '#DCEFEB',
    danger: '#B42318',
    dangerSoft: '#FDECEA',
    warning: '#8A5A00',
    warningSoft: '#FFF3D6',
  },
  dark: {
    text: '#F2F1ED',
    textSecondary: '#A9A59D',
    background: '#121311',
    surface: '#1B1D1A',
    backgroundElement: '#262925',
    backgroundSelected: '#343832',
    border: '#2E322D',
    primary: '#3FB8A4',
    onPrimary: '#06201C',
    primarySoft: '#173A34',
    danger: '#F97066',
    dangerSoft: '#3A1A17',
    warning: '#F5C259',
    warningSoft: '#3A2E12',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type Palette = { [K in ThemeColor]: string };

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 16,
  pill: 999,
} as const;

export const MaxContentWidth = 760;
