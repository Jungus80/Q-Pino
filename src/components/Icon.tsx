import React from 'react';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';

export type IconName =
  | 'mic'
  | 'stop'
  | 'check'
  | 'close'
  | 'edit'
  | 'save'
  | 'camera'
  | 'search'
  | 'user'
  | 'phone'
  | 'alert'
  | 'info'
  | 'error'
  | 'loading'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'home'
  | 'map'
  | 'dashboard'
  | 'query'
  | 'explore'
  | 'help'
  | 'plus'
  | 'minus';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface IconProps {
  name: IconName;
  size?: IconSize;
  color?: string;
  strokeWidth?: number;
}

const SIZE_MAP: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
};

export function Icon({ name, size = 'md', color = '#1F2937', strokeWidth = 1.5 }: IconProps) {
  const pixelSize = SIZE_MAP[size];

  const renderIcon = () => {
    switch (name) {
      case 'mic':
        return (
          <>
            <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Line x1="12" y1="19" x2="12" y2="23" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="8" y1="23" x2="16" y2="23" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'stop':
        return (
          <>
            <Rect x="6" y="6" width="12" height="12" rx="2" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );

      case 'check':
        return (
          <>
            <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'close':
        return (
          <>
            <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'edit':
        return (
          <>
            <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'save':
        return (
          <>
            <Path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="17 21 17 13 7 13 7 21" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="7 3 7 8 15 8" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'camera':
        return (
          <>
            <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="12" cy="13" r="4" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );

      case 'search':
        return (
          <>
            <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="m21 21-4.35-4.35" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'user':
        return (
          <>
            <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );

      case 'phone':
        return (
          <>
            <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'alert':
        return (
          <>
            <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05l-8.47-14.14a2 2 0 0 0-3.42 0z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Line x1="12" y1="9" x2="12" y2="13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Circle cx="12" cy="17" r="1" fill={color} />
          </>
        );

      case 'info':
        return (
          <>
            <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="12" y1="16" x2="12" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Circle cx="12" cy="8" r="1" fill={color} />
          </>
        );

      case 'error':
        return (
          <>
            <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Line x1="15" y1="9" x2="9" y2="15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="9" y1="9" x2="15" y2="15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'loading':
        return (
          <>
            <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} fill="none" opacity="0.25" />
            <Path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
          </>
        );

      case 'chevron-down':
        return (
          <>
            <Polyline points="6 9 12 15 18 9" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'chevron-right':
        return (
          <>
            <Polyline points="9 18 15 12 9 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'chevron-left':
        return (
          <>
            <Polyline points="15 18 9 12 15 6" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'home':
        return (
          <>
            <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="9 22 9 12 15 12 15 22" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'map':
        return (
          <>
            <Path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Line x1="8" y1="2" x2="8" y2="18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="16" y1="6" x2="16" y2="22" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'dashboard':
        return (
          <>
            <Rect x="3" y="3" width="7" height="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="14" y="3" width="7" height="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="14" y="14" width="7" height="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Rect x="3" y="14" width="7" height="7" stroke={color} strokeWidth={strokeWidth} fill="none" />
          </>
        );

      case 'query':
        return (
          <>
            <Circle cx="12" cy="12" r="1" fill={color} />
            <Circle cx="19" cy="12" r="1" fill={color} />
            <Circle cx="5" cy="12" r="1" fill={color} />
          </>
        );

      case 'explore':
        return (
          <>
            <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Polyline points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        );

      case 'help':
        return (
          <>
            <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={strokeWidth} fill="none" />
            <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx="12" cy="17" r="1" fill={color} />
          </>
        );

      case 'plus':
        return (
          <>
            <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      case 'minus':
        return (
          <>
            <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Svg width={pixelSize} height={pixelSize} viewBox="0 0 24 24">
      {renderIcon()}
    </Svg>
  );
}
