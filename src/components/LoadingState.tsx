import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal as RNModal, Pressable } from 'react-native';
import { Icon } from './Icon';

interface LoadingStateProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  progress?: number;
  showProgress?: boolean;
  icon?: React.ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function LoadingState({
  visible,
  title,
  subtitle,
  progress,
  showProgress = false,
  icon,
  onCancel,
  cancelLabel = 'Cancelar',
}: LoadingStateProps) {
  return (
    <RNModal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {icon ? (
            <View style={styles.iconContainer}>{icon}</View>
          ) : (
            <ActivityIndicator size="large" color="#0066CC" style={styles.spinner} />
          )}

          <Text style={styles.title}>{title}</Text>

          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          {showProgress && progress !== undefined && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{progress}%</Text>
            </View>
          )}

          {onCancel && (
            <Pressable onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  iconContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 24,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0066CC',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066CC',
  },
});
