import React from 'react';
import { Modal as RNModal, View, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Icon } from './Icon';
import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { FontFamily } from '@/theme/fonts';
import { BORDER_RADIUS } from '@/theme/globals';

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
  const card = useColor('card');
  const border = useColor('border');
  const muted = useColor('textMuted');
  const text = useColor('text');

  return (
    <RNModal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable
          style={styles.backdrop}
          onPress={closeOnBackdrop ? onClose : undefined}>
          <View style={[styles.container, { backgroundColor: card }]} onStartShouldSetResponder={() => true}>
            <View style={[styles.header, { borderBottomColor: border }]}>
              <Text style={[styles.title, { color: text }]}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Icon name="close" size="md" color={muted} />
              </Pressable>
            </View>

            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
              {children}
            </ScrollView>

            {actions && <View style={[styles.actions, { borderTopColor: border }]}>{actions}</View>}
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 23, 20, 0.45)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: BORDER_RADIUS,
    borderTopRightRadius: BORDER_RADIUS,
    maxHeight: '90%',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 18,
    fontFamily: FontFamily.serifBold,
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
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
