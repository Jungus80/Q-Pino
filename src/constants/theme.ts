import { Platform } from 'react-native';

import { Colors as ThemeColors } from '@/theme/colors';
import { FontFamily } from '@/theme/fonts';

export const Colors = {
  light: {
    text: ThemeColors.light.text,
    textSecondary: ThemeColors.light.textMuted,
    background: ThemeColors.light.background,
    backgroundElement: ThemeColors.light.secondary,
    backgroundSelected: ThemeColors.light.muted,
    border: ThemeColors.light.border,
    primary: ThemeColors.light.primary,
    primaryDark: ThemeColors.light.accentForeground,
    success: ThemeColors.light.success,
    warning: ThemeColors.light.warning,
    error: ThemeColors.light.error,
    info: ThemeColors.light.info,
  },
  dark: {
    text: ThemeColors.dark.text,
    textSecondary: ThemeColors.dark.textMuted,
    background: ThemeColors.dark.background,
    backgroundElement: ThemeColors.dark.secondary,
    backgroundSelected: ThemeColors.dark.muted,
    border: ThemeColors.dark.border,
    primary: ThemeColors.dark.primary,
    primaryDark: ThemeColors.dark.accentForeground,
    success: ThemeColors.dark.success,
    warning: ThemeColors.dark.warning,
    error: ThemeColors.dark.error,
    info: ThemeColors.dark.info,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const FontWeights = {
  regular: FontFamily.sans,
  medium: FontFamily.sansMedium,
  semiBold: FontFamily.sansSemi,
  bold: FontFamily.sansBold,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;

export const TabScreenSafeAreaEdges = Platform.select({
  android: ['top', 'left', 'right'] as const,
  default: undefined,
});

export const StickyFooterTabBarInset = Platform.select({ ios: 49, android: 0 }) ?? 0;
