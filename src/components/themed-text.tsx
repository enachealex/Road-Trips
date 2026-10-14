import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'caption' | 'label' | 'link' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? (type === 'link' ? 'primary' : 'text')] },
        styles[type],
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: 400,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
    letterSpacing: -0.2,
  },
  heading: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  caption: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: 500,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  link: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: 600,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 15,
    letterSpacing: 0.5,
  },
});
