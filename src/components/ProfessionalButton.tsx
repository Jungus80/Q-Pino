import React from 'react';
import { Pressable, Text, View, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ProfessionalButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const VARIANT_COLORS: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
  primary: { bg: '#0066CC', text: '#FFFFFF', border: '#0066CC' },
  secondary: { bg: '#F3F4F6', text: '#0066CC', border: '#E5E7EB' },
  danger: { bg: '#DC2626', text: '#FFFFFF', border: '#DC2626' },
  success: { bg: '#10B981', text: '#FFFFFF', border: '#10B981' },
  warning: { bg: '#F59E0B', text: '#FFFFFF', border: '#F59E0B' },
};

const SIZE_STYLES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 12 },
  md: { paddingVertical: 12, paddingHorizontal: 16, fontSize: 14 },
  lg: { paddingVertical: 16, paddingHorizontal: 24, fontSize: 16 },
};

export function ProfessionalButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: ProfessionalButtonProps) {
  const colors = VARIANT_COLORS[disabled && variant === 'primary' ? 'secondary' : variant];
  const sizeStyle = SIZE_STYLES[size];
  const isDisabledPrimary = disabled && variant === 'primary';

  const buttonStyle: ViewStyle = {
    backgroundColor: isDisabledPrimary ? '#E5E7EB' : colors.bg,
    borderColor: isDisabledPrimary ? '#D1D5DB' : colors.border,
    borderWidth: variant === 'secondary' || isDisabledPrimary ? 1 : 0,
    paddingVertical: sizeStyle.paddingVertical,
    paddingHorizontal: sizeStyle.paddingHorizontal,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    opacity: loading ? 0.6 : 1,
    alignSelf: fullWidth ? 'stretch' : undefined,
    minHeight: size === 'lg' ? 52 : size === 'md' ? 44 : 36,
  };

  const iconSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';
  const iconColor = isDisabledPrimary ? '#9CA3AF' : variant === 'secondary' ? '#0066CC' : '#FFFFFF';
  const textColor = isDisabledPrimary ? '#6B7280' : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        buttonStyle,
        pressed && !disabled && !loading && { opacity: 0.8 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <>
          {icon && iconPosition === 'left' && <Icon name={icon} size={iconSize} color={iconColor} />}
          <Text
            style={{
              fontSize: sizeStyle.fontSize,
              fontWeight: '600',
              color: textColor,
            }}>
            {label}
          </Text>
          {icon && iconPosition === 'right' && <Icon name={icon} size={iconSize} color={iconColor} />}
        </>
      )}
    </Pressable>
  );
}
