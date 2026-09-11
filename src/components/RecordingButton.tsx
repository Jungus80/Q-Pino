import React from 'react';
import { Pressable, View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface RecordingButtonProps {
  isRecording: boolean;
  isLoading: boolean;
  isTranscribing: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Smaller footprint when voice is the secondary capture path. */
  compact?: boolean;
}

export function RecordingButton({
  isRecording,
  isLoading,
  isTranscribing,
  onPress,
  disabled = false,
  compact = false,
}: RecordingButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
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
    if (isTranscribing) return '#D1D5DB';
    if (isRecording) return '#DC2626';
    return '#0066CC';
  };

  const getIcon = () => {
    if (isTranscribing) return 'loading';
    if (isRecording) return 'stop';
    return 'mic';
  };

  const getLabel = () => {
    if (isTranscribing) return 'Convirtiendo audio a texto';
    if (isRecording) return 'Grabando audio';
    return 'Presiona para iniciar grabación';
  };

  const buttonSize = compact && !isRecording ? 96 : 140;
  const iconSize = compact && !isRecording ? 'lg' : 'xl';

  return (
    <View style={[styles.container, compact && !isRecording && styles.containerCompact]}>
      <Animated.View
        style={[
          styles.buttonWrapper,
          compact && !isRecording && styles.buttonWrapperCompact,
          {
            transform: [{ scale: scaleAnim }, { scale: pulseAnim }],
          },
        ]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          // Model loading runs in parallel with recording (see asr.ts) — while
          // isRecording is true, isLoading/isTranscribing must never block the
          // stop tap, or the user gets stuck unable to stop until the model
          // finishes loading in the background.
          disabled={disabled || (!isRecording && (isLoading || isTranscribing))}
          style={[
            styles.button,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              backgroundColor: getBackgroundColor(),
              opacity: disabled || (!isRecording && (isLoading || isTranscribing)) ? 0.6 : 1,
            },
          ]}>
          <Icon name={getIcon()} size={iconSize} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
      <Text style={[styles.label, compact && !isRecording && styles.labelCompact]}>{getLabel()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 24,
  },
  containerCompact: {
    marginVertical: 8,
  },
  buttonWrapper: {
    marginBottom: 12,
  },
  buttonWrapperCompact: {
    marginBottom: 8,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  labelCompact: {
    fontSize: 13,
    color: '#6B7280',
  },
});
