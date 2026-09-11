import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { BORDER_RADIUS, CORNERS, SPACING } from '@/theme/globals';
import { Platform, StyleSheet } from 'react-native';

export function useAppStyles() {
  const background = useColor('background');
  const card = useColor('card');
  const text = useColor('text');
  const muted = useColor('textMuted');
  const border = useColor('border');
  const primary = useColor('primary');
  const primaryFg = useColor('primaryForeground');
  const secondary = useColor('secondary');
  const red = useColor('red');
  const orange = useColor('orange');
  const green = useColor('green');
  const input = useColor('input');

  return {
    background,
    card,
    text,
    muted,
    border,
    primary,
    primaryFg,
    secondary,
    red,
    orange,
    green,
    input,
    styles: StyleSheet.create({
      screen: { flex: 1, backgroundColor: background },
      centered: { flex: 1, backgroundColor: background, alignItems: 'center', justifyContent: 'center' },
      headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
      headerTextCol: { flex: 1, minWidth: 0 },
      title: { fontFamily: FontFamily.serifBold, fontSize: 26, color: text },
      subtitle: { fontFamily: FontFamily.sans, fontSize: 14, color: muted, marginTop: 4 },
      sectionLabel: {
        fontFamily: FontFamily.sansMedium,
        fontSize: 13,
        color: muted,
        letterSpacing: 0.3,
        marginBottom: 12,
      },
      body: { fontFamily: FontFamily.sans, fontSize: 15, color: text, lineHeight: 22 },
      bodySm: { fontFamily: FontFamily.sans, fontSize: 13, color: muted, lineHeight: 18 },
      bodySemi: { fontFamily: FontFamily.sansSemi, fontSize: 15, color: text },
      monoLg: { fontFamily: FontFamily.monoMedium, fontSize: 28, color: text },
      row: { flexDirection: 'row', alignItems: 'center' },
      wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
      card: {
        backgroundColor: card,
        borderRadius: BORDER_RADIUS,
        padding: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: border,
      },
      listRow: {
        backgroundColor: card,
        borderRadius: BORDER_RADIUS,
        padding: 14,
        marginBottom: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      input: {
        backgroundColor: input,
        color: text,
        borderRadius: BORDER_RADIUS,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontFamily: FontFamily.sans,
        fontSize: 16,
      },
      ghostChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: secondary,
        borderRadius: BORDER_RADIUS,
        paddingHorizontal: 12,
        paddingVertical: 8,
        maxWidth: '100%',
        flexShrink: 1,
      },
      ghostChipText: {
        fontFamily: FontFamily.sansMedium,
        fontSize: 13,
        color: text,
        flexShrink: 1,
      },
      footerShadow: {
        shadowColor: '#1A1714',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: Platform.OS === 'android' ? 6 : 0,
      },
      pad: { padding: SPACING.md },
      padBottom: { paddingBottom: 48 },
    }),
    CORNERS,
    BORDER_RADIUS,
  };
}
