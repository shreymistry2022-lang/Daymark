// src/components/BrandOpeningScreen.tsx
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

interface BrandOpeningScreenProps {
  /**
   * True when initial auth and habits data are ready in the background.
   */
  isReady?: boolean;
  /**
   * Called when the aperture reveal animation completes.
   */
  onFinish?: () => void;
}

/**
 * GetYourGuide-style brand opening animation:
 * 1. Logo appears centered.
 * 2. Logo smoothly morphs / crossfades into the brand name ("DAYMARK").
 * 3. Brand name collapses into a minimalist center dot.
 * 4. The dot rapidly expands outward (aperture zoom), revealing the Dashboard underneath!
 */
export const BrandOpeningScreen: React.FC<BrandOpeningScreenProps> = ({
  isReady = true,
  onFinish,
}) => {
  const { colors, isDark } = useTheme();

  // Animation values (React 19 compliant state initializers)
  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [logoScale] = useState(() => new Animated.Value(0.88));

  const [nameOpacity] = useState(() => new Animated.Value(0));
  const [nameScale] = useState(() => new Animated.Value(0.85));

  const [dotOpacity] = useState(() => new Animated.Value(0));
  const [dotScale] = useState(() => new Animated.Value(0.4));

  const [overlayOpacity] = useState(() => new Animated.Value(1));

  const [isRevealing, setIsRevealing] = useState(false);
  const isRevealingRef = useRef(false);
  const minSequenceDoneRef = useRef(false);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const isReadyRef = useRef(isReady);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  // Phase 4: Aperture Reveal (Dot expands rapidly, unveiling the app)
  const triggerApertureReveal = useCallback(() => {
    if (isRevealingRef.current) return;
    isRevealingRef.current = true;
    setIsRevealing(true);

    Animated.parallel([
      // Dot zooms outwards into infinity
      Animated.timing(dotScale, {
        toValue: 65,
        duration: 380,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }),
      // Overlay cross-dissolves to reveal dashboard
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      onFinishRef.current?.();
    });
  }, [dotScale, overlayOpacity]);

  useEffect(() => {
    // Execute sequential choreography: Logo -> Name -> Dot
    Animated.sequence([
      // 1. Logo appears & settles (0 - 600ms)
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.0,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(350),

      // 2. Logo transitions to Brand Name "DAYMARK" (600 - 1150ms)
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 0.82,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(nameOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(nameScale, {
          toValue: 1.0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(450),

      // 3. Name collapses into center Dot (1150 - 1450ms)
      Animated.parallel([
        Animated.timing(nameOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(nameScale, {
          toValue: 0.35,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dotScale, {
          toValue: 1.0,
          duration: 180,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      minSequenceDoneRef.current = true;
      if (isReadyRef.current) {
        triggerApertureReveal();
      }
    });

    // Safety timeout in case underlying data loading takes longer
    const safetyTimer = setTimeout(() => {
      triggerApertureReveal();
    }, 2800);

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [
    dotOpacity,
    dotScale,
    logoOpacity,
    logoScale,
    nameOpacity,
    nameScale,
    triggerApertureReveal,
  ]);

  // If underlying app is ready and animation sequence reached the dot, trigger reveal
  useEffect(() => {
    if (isReady && minSequenceDoneRef.current && !isRevealingRef.current) {
      triggerApertureReveal();
    }
  }, [isReady, triggerApertureReveal]);

  return (
    <Animated.View
      pointerEvents={isRevealing ? 'none' : 'auto'}
      style={[
        styles.container,
        {
          backgroundColor: colors.background || '#0D0E12',
          opacity: overlayOpacity,
        },
      ]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* 1. Centered Brand Logo */}
      <Animated.View
        style={[
          styles.centerBox,
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

      {/* 2. Centered Brand Name ("DAYMARK") */}
      <Animated.View
        style={[
          styles.centerBox,
          {
            opacity: nameOpacity,
            transform: [{ scale: nameScale }],
          },
        ]}
      >
        <Text style={[styles.brandName, { color: colors.primaryText || '#FFFFFF' }]}>
          DAYMARK
        </Text>
      </Animated.View>

      {/* 3. Centered Aperture Dot */}
      <Animated.View
        style={[
          styles.centerBox,
          styles.dotWrapper,
          {
            opacity: dotOpacity,
            transform: [{ scale: dotScale }],
          },
        ]}
      >
        <View
          style={[
            styles.dot,
            {
              backgroundColor: colors.accent || '#FFFFFF',
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
    overflow: 'hidden',
  },
  centerBox: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 92,
    height: 92,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  dotWrapper: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});
