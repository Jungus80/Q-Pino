import { AudioWaveform } from '@/components/ui/audio-waveform';
import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { useHaptics } from '@/hooks/useHaptics';
import { FontFamily } from '@/theme/fonts';
import { BORDER_RADIUS } from '@/theme/globals';
import { Icon } from '@/components/Icon';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const BARS = 30;
const ICON_ON_MIC = '#FFFCF6';

export function VoiceCapture({
  isRecording,
  isStarting,
  isLoadingModel,
  isTranscribing,
  audioLevel,
  onToggle,
  embedded = false,
}: {
  isRecording: boolean;
  isStarting: boolean;
  isLoadingModel: boolean;
  isTranscribing: boolean;
  audioLevel: number;
  onToggle: () => void;
  embedded?: boolean;
}) {
  const red = useColor('red');
  const primary = useColor('primary');
  const muted = useColor('textMuted');
  const text = useColor('text');
  const border = useColor('border');
  const haptics = useHaptics();
  const pulse = useSharedValue(1);
  const [waveform, setWaveform] = useState(() => Array.from({ length: BARS }, () => 0.12));
  const history = useRef(Array.from({ length: BARS }, () => 0.12));

  useEffect(() => {
    if (!isRecording) {
      history.current = Array.from({ length: BARS }, () => 0.12);
      setWaveform(history.current);
      return;
    }
    history.current = [...history.current.slice(1), Math.max(0.08, Math.min(1, audioLevel * 2.2))];
    setWaveform([...history.current]);
  }, [audioLevel, isRecording]);

  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(withTiming(1.12, { duration: 600, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 220 });
    }
    return () => cancelAnimation(pulse);
  }, [isRecording, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const busy = isLoadingModel || isTranscribing;
  const label = isTranscribing
    ? 'Convirtiendo audio a texto'
    : isLoadingModel
      ? 'Preparando reconocimiento de voz'
      : isRecording
        ? 'Grabando audio'
        : isStarting
          ? 'Iniciando grabación…'
          : 'Presiona para grabar';

  const fill = isRecording ? red : primary;

  const micButton = (
    <Animated.View
      style={[
        styles.mic,
        pulseStyle,
        {
          backgroundColor: fill,
          opacity: isStarting ? 0.75 : 1,
        },
      ]}
    >
      <Pressable
        onPress={() => {
          haptics('impact-medium');
          onToggle();
        }}
        disabled={isStarting || (!isRecording && busy)}
        android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
        style={styles.micHit}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {isStarting ? (
          <ActivityIndicator color={ICON_ON_MIC} />
        ) : (
          <Icon name={isRecording ? 'stop' : 'mic'} size="lg" color={ICON_ON_MIC} strokeWidth={2} />
        )}
      </Pressable>
    </Animated.View>
  );

  if (busy && !isRecording) {
    return (
      <View style={styles.busy}>
        <ActivityIndicator color={primary} />
        <Text variant="caption" style={{ marginTop: 8, textAlign: 'center', color: text }}>{label}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.panel,
        embedded && styles.embedded,
        !embedded && { borderColor: isRecording ? red : border },
      ]}
    >
      {isRecording ? (
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: red }]} />
          <Text style={{ color: red, fontFamily: FontFamily.sansSemi, fontSize: 13 }}>Grabando</Text>
        </View>
      ) : null}

      {isRecording ? (
        <AudioWaveform
          data={waveform}
          animated={false}
          isPlaying={false}
          height={56}
          barCount={BARS}
          barWidth={4}
          barGap={2}
          activeColor={red}
          inactiveColor={muted}
        />
      ) : null}

      {micButton}
      <Text
        variant="caption"
        style={{ marginTop: 12, textAlign: 'center', color: text, fontFamily: FontFamily.sansSemi }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: BORDER_RADIUS,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  embedded: {
    borderWidth: 0,
    padding: 8,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, alignSelf: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  busy: { alignItems: 'center', paddingVertical: 12 },
  mic: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginTop: 4,
    overflow: 'hidden',
  },
  micHit: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
