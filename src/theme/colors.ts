const lightColors = {
  background: '#F3EFE6',
  foreground: '#1A1714',

  card: '#FFFCF6',
  cardForeground: '#1A1714',

  popover: '#FFFCF6',
  popoverForeground: '#1A1714',

  primary: '#1F5C56',
  primaryForeground: '#F7F3EA',

  secondary: '#EBE4D6',
  secondaryForeground: '#1A1714',

  muted: '#E8E0D2',
  mutedForeground: '#6B645C',

  accent: '#E4EDE9',
  accentForeground: '#143D38',

  destructive: '#B42318',
  destructiveForeground: '#FFFCF6',

  border: '#E4DCCF',
  input: '#EBE4D6',
  ring: '#1F5C56',

  text: '#1A1714',
  textMuted: '#6B645C',

  tint: '#1F5C56',
  icon: '#6B645C',
  tabIconDefault: '#8A8278',
  tabIconSelected: '#1F5C56',

  blue: '#1F5C56',
  green: '#2F6B4F',
  red: '#B42318',
  orange: '#B45309',
  yellow: '#C9A227',
  pink: '#9B4A6A',
  purple: '#5C4A6E',
  teal: '#1F5C56',
  indigo: '#3D4A5C',

  success: '#2F6B4F',
  successForeground: '#F7F3EA',
  warning: '#B45309',
  warningForeground: '#FFFCF6',
  info: '#1F5C56',
  infoForeground: '#F7F3EA',
  error: '#B42318',
  errorForeground: '#FFFCF6',
};

const darkColors = {
  background: '#12110F',
  foreground: '#F4EFE6',

  card: '#1C1A17',
  cardForeground: '#F4EFE6',

  popover: '#1C1A17',
  popoverForeground: '#F4EFE6',

  primary: '#8FB8B2',
  primaryForeground: '#12110F',

  secondary: '#26231E',
  secondaryForeground: '#F4EFE6',

  muted: '#2A2722',
  mutedForeground: '#A89F93',

  accent: '#24302D',
  accentForeground: '#C5D9D5',

  destructive: '#E07068',
  destructiveForeground: '#12110F',

  border: '#3A352E',
  input: 'rgba(244, 239, 230, 0.12)',
  ring: '#8FB8B2',

  text: '#F4EFE6',
  textMuted: '#A89F93',

  tint: '#8FB8B2',
  icon: '#A89F93',
  tabIconDefault: '#8A8278',
  tabIconSelected: '#8FB8B2',

  blue: '#8FB8B2',
  green: '#7CB092',
  red: '#E07068',
  orange: '#E09A4A',
  yellow: '#D4B44A',
  pink: '#C97A96',
  purple: '#9B8BB0',
  teal: '#8FB8B2',
  indigo: '#8A96A8',

  success: '#7CB092',
  successForeground: '#12110F',
  warning: '#E09A4A',
  warningForeground: '#12110F',
  info: '#8FB8B2',
  infoForeground: '#12110F',
  error: '#E07068',
  errorForeground: '#12110F',
};

export const Colors = {
  light: lightColors,
  dark: darkColors,
};

export { darkColors, lightColors };

export type ColorKeys = keyof typeof lightColors;

export const withOpacity = (color: string, opacity: number) => {
  if (color.startsWith('rgba')) {
    return color;
  }

  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  return color;
};
