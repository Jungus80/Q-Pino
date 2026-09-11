import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';

export function useTheme() {
  const scheme = useColorScheme();
  return Colors[scheme];
}
