import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { FONT_SIZE } from '@/theme/globals';
import React, { forwardRef } from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
} from 'react-native';

type TextVariant =
  'body' | 'title' | 'subtitle' | 'caption' | 'heading' | 'link';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  lightColor?: string;
  darkColor?: string;
  children: React.ReactNode;
}

const headingVariants: TextVariant[] = ['heading', 'title', 'subtitle'];

export const Text = React.memo(
  forwardRef<RNText, TextProps>(
    (
      { variant = 'body', lightColor, darkColor, style, children, ...props },
      ref
    ) => {
      const textColor = useColor('text', {
        light: lightColor,
        dark: darkColor,
      });
      const mutedColor = useColor('textMuted');
      const defaultAccessibilityRole = headingVariants.includes(variant)
        ? 'header'
        : undefined;

      const getTextStyle = (): TextStyle => {
        const baseStyle: TextStyle = {
          color: textColor,
          fontFamily: FontFamily.sans,
        };

        switch (variant) {
          case 'heading':
            return {
              ...baseStyle,
              fontFamily: FontFamily.serifBold,
              fontSize: 28,
            };
          case 'title':
            return {
              ...baseStyle,
              fontFamily: FontFamily.serifBold,
              fontSize: 26,
            };
          case 'subtitle':
            return {
              ...baseStyle,
              fontFamily: FontFamily.sansSemi,
              fontSize: 17,
            };
          case 'caption':
            return {
              ...baseStyle,
              fontFamily: FontFamily.sansMedium,
              fontSize: 13,
              color: mutedColor,
            };
          case 'link':
            return {
              ...baseStyle,
              fontFamily: FontFamily.sansMedium,
              fontSize: FONT_SIZE,
              textDecorationLine: 'underline',
            };
          default: // 'body'
            return {
              ...baseStyle,
              fontSize: FONT_SIZE,
            };
        }
      };

      return (
        <RNText
          ref={ref}
          style={[getTextStyle(), style]}
          accessibilityRole={defaultAccessibilityRole}
          {...props}
        >
          {children}
        </RNText>
      );
    }
  )
);

Text.displayName = 'Text';
