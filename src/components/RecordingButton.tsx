import React from 'react';
import { Pressable, View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';

interface RecordingButtonProps {
  isRecording: boolean;
  isLoading: boolean;
  isTranscribing: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function RecordingButton({
  isRecording,
  isLoading,
  isTranscribing,
  onPress,
  disabled = false,
}: RecordingButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      // Pulse animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const getBackgroundColor = () => {
    if (isTranscribing) return '#D1D5DB'; // gray
    if (isRecording) return '#DC2626'; // red
    return '#0066CC'; // blue
  };

  const getIcon = () => {
    if (isTranscribing) return '⏳';
    if (isRecording) return '⏹';
    return '🎙';
  };

  const getLabel = () => {
    if (isTranscribing) return 'Transcribiendo...';
    if (isRecording) return 'Grabando...';
    return 'Pulsa para grabar';
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.buttonWrapper,
          {
            transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
          },
        ]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || isLoading || isTranscribing}
          style={[
            styles.button,
            {
              backgroundColor: getBackgroundColor(),
              opacity: disabled || isLoading || isTranscribing ? 0.6 : 1,
            },
          ]}>
          <Text style={styles.icon}>{getIcon()}</Text>
        </Pressable>
      </Animated.View>
      <Text style={styles.label}>{getLabel()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 24,
  },
  buttonWrapper: {
    marginBottom: 12,
  },
  button: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  icon: {
    fontSize: 48,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
});
