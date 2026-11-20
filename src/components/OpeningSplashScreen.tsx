// src/components/OpeningSplashScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme/ThemeProvider';

interface OpeningSplashScreenProps {
  /**
   * Set to true when underlying data / authentication is ready to display.
   */
  isReady?: boolean;
  /**
   * Called once the exit animation completes and the splash screen can be unmounted.
   */
  onFinish?: () => void;
  /**
   * Minimum time (ms) to keep the opening screen visible before starting exit animation.
   * Minimalist default: 850ms (clean, fast, non-intrusive).
   */
  minimumDurationMs?: number;
}

export const OpeningSplashScreen: React.FC<OpeningSplashScreenProps> = ({
  isReady = true,
  onFinish,
  minimumDurationMs = 850,
}) => {
  const { colors, isDark } = useTheme();

  // Minimalist animation values (React 19 compliant state initializers)
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [scaleAnim] = useState(() => new Animated.Value(0.92));
  const [containerOpacity] = useState(() => new Animated.Value(1));

  // State to coordinate exit
  const [isExiting, setIsExiting] = useState(false);
  const isExitingRef = useRef(false);
  const minTimeElapsedRef = useRef(false);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const isReadyRef = useRef(isReady);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  // Smooth, subtle exit transition
  const triggerExitAnimation = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    setIsExiting(true);

    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1.04,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinishRef.current?.();
    });
  }, [containerOpacity, scaleAnim]);

  useEffect(() => {
    // 1. Minimalist entrance: clean fade-in and subtle settling
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Minimum duration timer (crisp & snappy)
    const minTimer = setTimeout(() => {
      minTimeElapsedRef.current = true;
      if (isReadyRef.current) {
        triggerExitAnimation();
      }
    }, minimumDurationMs);

    // 3. Fallback safety timeout (2400ms)
    const safetyTimer = setTimeout(() => {
      triggerExitAnimation();
    }, 2400);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
    };
  }, [fadeAnim, minimumDurationMs, scaleAnim, triggerExitAnimation]);

  // Watch for isReady once minimum time has elapsed
  useEffect(() => {
    if (isReady && minTimeElapsedRef.current && !isExitingRef.current) {
      triggerExitAnimation();
    }
  }, [isReady, triggerExitAnimation]);

  return (
    <Animated.View
      pointerEvents={isExiting ? 'none' : 'auto'}
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          opacity: containerOpacity,
        },
      ]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Centered Minimalist Logo & Title */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('../../assets/brand-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={[styles.brandTitle, { color: colors.primaryText }]}>
          Daymark
        </Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 84,
    height: 84,
  },
  brandTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
});
