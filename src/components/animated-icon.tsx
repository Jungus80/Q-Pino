import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const HOLD_MS = 700;
const FADE_MS = 350;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const holdStarted = useRef(false);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      opacity: 1,
    },
    100: {
      opacity: 0,
      easing: Easing.out(Easing.cubic),
    },
  });

  const image = <Image style={styles.image} source={require('@/assets/images/icon.png')} />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(FADE_MS).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      <View style={styles.content}>
        {image}
        <Text style={styles.title}>Q-Pino</Text>
      </View>
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        if (holdStarted.current) return;
        holdStarted.current = true;
        SplashScreen.hideAsync().finally(() => {
          setTimeout(() => setAnimate(true), HOLD_MS);
        });
      }}
      style={styles.splashOverlay}>
      <View style={styles.content}>
        {image}
        <Text style={styles.title}>Q-Pino</Text>
      </View>
    </View>
  );
}

const DURATION = 700;

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.15 }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.out(Easing.cubic),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '0deg' }],
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View entering={keyframe.duration(DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  image: {
    width: 72,
    height: 72,
    marginBottom: 12,
    borderRadius: 16,
  },
  background: {
    borderRadius: 40,
    backgroundColor: '#1F5C56',
    width: 128,
    height: 128,
    position: 'absolute',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F3EFE6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Newsreader_700Bold',
    color: '#1A1714',
    letterSpacing: 0.4,
  },
});
