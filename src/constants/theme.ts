/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1F2937',
    textSecondary: '#6B7280',
    background: '#FFFFFF',
    backgroundElement: '#F3F4F6',
    backgroundSelected: '#E5E7EB',
    border: '#E5E7EB',
    primary: '#0066CC',
    primaryDark: '#004C99',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#DC2626',
    info: '#0EA5E9',
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#D1D5DB',
    background: '#111827',
    backgroundElement: '#1F2937',
    backgroundSelected: '#374151',
    border: '#374151',
    primary: '#3B82F6',
    primaryDark: '#1D4ED8',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#06B6D4',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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

/**
 * Explicit weight -> font family map. Android's stock Roboto only has true
 * Normal/Bold static faces, so numeric fontWeight on intermediate values
 * (500/600) gets rounded up to bold there. Inter ships real static faces per
 * weight, loaded via expo-font in the root layout, so text renders at the
 * intended weight on every platform.
 */
export const FontWeights = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
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

/**
 * Edges for <SafeAreaView> on tab screens. Android's NativeTabs already wraps
 * screen content in its own bottom-edge SafeAreaView (reserving the real,
 * measured tab bar height) — adding 'bottom' here too double-reserves that
 * space. iOS's NativeTabs does not do this, so it still needs the default.
 */
export const TabScreenSafeAreaEdges = Platform.select({
  android: ['top', 'left', 'right'] as const,
  default: undefined,
});

/** Extra bottom padding a sticky footer needs to clear the tab bar. iOS's
 * NativeTabs doesn't reserve tab-bar space for screen content the way
 * Android's does, so only iOS needs an explicit push here. */
export const StickyFooterTabBarInset = Platform.select({ ios: 49, android: 0 }) ?? 0;
