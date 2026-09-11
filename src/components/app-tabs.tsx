import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useColor } from '@/hooks/useColor';

export default function AppTabs() {
  const background = useColor('background');
  const secondary = useColor('secondary');
  const muted = useColor('tabIconDefault');
  const selected = useColor('tabIconSelected');

  return (
    <NativeTabs
      backgroundColor={background}
      indicatorColor={secondary}
      iconColor={{ default: muted, selected }}
      labelStyle={{ selected: { color: selected } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Capturar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: require('@/assets/images/tabIcons/home-inactive.png'),
            selected: require('@/assets/images/tabIcons/home-selected.png'),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Clientes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: require('@/assets/images/tabIcons/explore-inactive.png'),
            selected: require('@/assets/images/tabIcons/explore-selected.png'),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="dashboard">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="chart.bar.fill"
          src={{
            default: require('@/assets/images/tabIcons/dashboard-inactive.png'),
            selected: require('@/assets/images/tabIcons/dashboard-selected.png'),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Label>Mapa</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="map.fill"
          src={{
            default: require('@/assets/images/tabIcons/map-inactive.png'),
            selected: require('@/assets/images/tabIcons/map-selected.png'),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="query">
        <NativeTabs.Trigger.Label>Consultas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="bubble.left.and.bubble.right.fill"
          src={{
            default: require('@/assets/images/tabIcons/query-inactive.png'),
            selected: require('@/assets/images/tabIcons/query-selected.png'),
          }}
          renderingMode="original"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
