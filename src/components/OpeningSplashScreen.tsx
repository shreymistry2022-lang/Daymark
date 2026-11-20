// src/components/OpeningSplashScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
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
   * Default: 1350ms (matches Instagram / WhatsApp / YouTube launch feel).
   */
  minimumDurationMs?: number;
}

export const OpeningSplashScreen: React.FC<OpeningSplashScreenProps> = ({
  isReady = true,
  onFinish,
  minimumDurationMs = 1350,
}) => {
  const { colors, isDark } = useTheme();

  // Animation values (React 19 compliant state initializers)
  const [containerOpacity] = useState(() => new Animated.Value(1));
  const [logoScale] = useState(() => new Animated.Value(0.72));
  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [glowScale] = useState(() => new Animated.Value(0.6));
  const [glowOpacity] = useState(() => new Animated.Value(0));
  const [textTranslateY] = useState(() => new Animated.Value(14));
  const [textOpacity] = useState(() => new Animated.Value(0));
  const [footerOpacity] = useState(() => new Animated.Value(0));
  const [pulseScale] = useState(() => new Animated.Value(1));

  // State to coordinate exit
  const [isExiting, setIsExiting] = useState(false);
  const isExitingRef = useRef(false);
  const minTimeElapsedRef = useRef(false);
  const breathingLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const isReadyRef = useRef(isReady);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  // Trigger smooth exit transition (WhatsApp / Instagram / YouTube style zoom-through)
  const triggerExitAnimation = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    setIsExiting(true);

    // Stop ambient breathing
    if (breathingLoopRef.current) {
      breathingLoopRef.current.stop();
    }

    Animated.parallel([
      // Signature zoom-through expansion on logo
      Animated.timing(logoScale, {
        toValue: 1.28,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      // Fade out glowing aura
      Animated.timing(glowOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
      // Fade out brand text
      Animated.timing(textOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      // Fade out footer
      Animated.timing(footerOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      // Container cross-dissolve to reveal the dashboard
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinishRef.current?.();
    });
  }, [
    containerOpacity,
    footerOpacity,
    glowOpacity,
    logoOpacity,
    logoScale,
    textOpacity,
  ]);

  useEffect(() => {
    // 1. Entrance animation sequence
    Animated.parallel([
      // Logo springs in smoothly
      Animated.spring(logoScale, {
        toValue: 1.0,
        tension: 48,
        friction: 6.5,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1.0,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Ambient halo expands
      Animated.spring(glowScale, {
        toValue: 1.0,
        tension: 42,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: 0.35,
        duration: 480,
        useNativeDriver: true,
      }),
      // Brand title & footer slide up gently
      Animated.sequence([
        Animated.delay(140),
        Animated.parallel([
          Animated.timing(textTranslateY, {
            toValue: 0,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textOpacity, {
            toValue: 1.0,
            duration: 380,
            useNativeDriver: true,
          }),
          Animated.timing(footerOpacity, {
            toValue: 1.0,
            duration: 420,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      // 2. Start ambient breathing pulse after entrance
      if (!isExitingRef.current) {
        breathingLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(glowScale, {
                toValue: 1.15,
                duration: 900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(glowOpacity, {
                toValue: 0.5,
                duration: 900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(pulseScale, {
                toValue: 1.03,
                duration: 900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(glowScale, {
                toValue: 1.0,
                duration: 900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(glowOpacity, {
                toValue: 0.3,
                duration: 900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(pulseScale, {
                toValue: 1.0,
                duration: 900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ])
        );
        breathingLoopRef.current.start();
      }
    });

    // 3. Minimum display timer
    const minTimer = setTimeout(() => {
      minTimeElapsedRef.current = true;
      if (isReadyRef.current) {
        triggerExitAnimation();
      }
    }, minimumDurationMs);

    // 4. Maximum safety timeout (3200ms) so app never blocks indefinitely
    const safetyTimer = setTimeout(() => {
      triggerExitAnimation();
    }, 3200);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(safetyTimer);
      if (breathingLoopRef.current) {
        breathingLoopRef.current.stop();
      }
    };
  }, [
    footerOpacity,
    glowOpacity,
    glowScale,
    logoOpacity,
    logoScale,
    minimumDurationMs,
    pulseScale,
    textOpacity,
    textTranslateY,
    triggerExitAnimation,
  ]);

  // Watch for isReady once minimum time has elapsed
  useEffect(() => {
    if (isReady && minTimeElapsedRef.current && !isExitingRef.current) {
      triggerExitAnimation();
    }
  }, [isReady, triggerExitAnimation]);

  const accentColor = colors.accent || '#10B981';

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

      {/* Center Branding Area */}
      <View style={styles.centerContent}>
        {/* Ambient Halo behind logo */}
        <Animated.View
          style={[
            styles.glowRingOuter,
            {
              backgroundColor: accentColor,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.glowRingInner,
            {
              backgroundColor: accentColor,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        {/* Animated Logo Image */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../../assets/brand-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Brand Name & Tagline */}
        <Animated.View
          style={[
            styles.brandTextContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={[styles.brandTitle, { color: colors.primaryText }]}>
            DAYMARK
          </Text>
          <View style={styles.taglineRow}>
            <View style={[styles.taglineDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.brandTagline, { color: colors.secondaryText }]}>
              HABIT SYSTEM & ROUTINES
            </Text>
            <View style={[styles.taglineDot, { backgroundColor: accentColor }]} />
          </View>
        </Animated.View>
      </View>

      {/* Bottom Footer (WhatsApp "from Meta" / YouTube style) */}
      <Animated.View
        style={[
          styles.footerContainer,
          {
            opacity: footerOpacity,
          },
        ]}
      >
        <Text style={[styles.footerSubtext, { color: colors.mutedText }]}>
          from
        </Text>
        <Text style={[styles.footerBrand, { color: colors.primaryText }]}>
          DAYMARK
        </Text>
        {/* Subtle pulsing accent bar */}
        <Animated.View
          style={[
            styles.pulseBar,
            {
              backgroundColor: accentColor,
              transform: [{ scaleX: pulseScale }],
            },
          ]}
        />
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
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRingOuter: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  glowRingInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  logoContainer: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  logoImage: {
    width: 104,
    height: 104,
  },
  brandTextContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  brandTagline: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
  },
  footerSubtext: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'lowercase',
    marginBottom: 2,
  },
  footerBrand: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  pulseBar: {
    width: 36,
    height: 2.5,
    borderRadius: 1.5,
    marginTop: 10,
    opacity: 0.7,
  },
});
