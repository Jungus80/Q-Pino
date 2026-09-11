import React from 'react';
import { Modal as RNModal, View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Icon } from './Icon';

interface ModalProps {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
  closeOnBackdrop?: boolean;
}

export function Modal({
  visible,
  title,
  children,
  onClose,
  actions,
  closeOnBackdrop = true,
}: ModalProps) {
  return (
    <RNModal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable
          style={styles.backdrop}
          onPress={closeOnBackdrop ? onClose : undefined}>
          <View style={styles.container} onStartShouldSetResponder={() => true}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Icon name="close" size="md" color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
              {children}
            </ScrollView>

            {actions && <View style={styles.actions}>{actions}</View>}
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  actions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
});
