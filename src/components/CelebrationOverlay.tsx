// src/components/CelebrationOverlay.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#FFD700', // Gold
  '#FF7A00', // Daymark Orange
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#F59E0B', // Amber
  '#14B8A6', // Teal
  '#EF4444', // Red
  '#A855F7', // Violet
];

interface ConfettiPieceProps {
  index: number;
}

const ConfettiPiece: React.FC<ConfettiPieceProps> = ({ index }) => {
  const [fallAnim] = useState(() => new Animated.Value(0));
  const [swayAnim] = useState(() => new Animated.Value(0));
  const [rotateAnim] = useState(() => new Animated.Value(0));

  // Deterministic attributes for pure rendering
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const sizeWidth = 8 + (index * 7) % 10;
  const sizeHeight = 10 + (index * 11) % 14;
  const isCircle = index % 4 === 0;
  const isDiamond = index % 5 === 0;
  const startX = ((index * 71 + 19) % Math.floor(SCREEN_WIDTH - 30)) + 15;
  const duration = 2400 + (index * 73) % 1400;
  const delay = (index * 45) % 700;
  const swayDistance = (index % 2 === 0 ? 1 : -1) * (20 + (index % 35));
  const useNative = Platform.OS !== 'web';

  useEffect(() => {
    fallAnim.setValue(0);
    swayAnim.setValue(0);
    rotateAnim.setValue(0);

    const fallAnimation = Animated.timing(fallAnim, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: useNative,
    });

    const swayAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1,
          duration: 350 + (index % 5) * 60,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
        Animated.timing(swayAnim, {
          toValue: -1,
          duration: 350 + (index % 5) * 60,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: useNative,
        }),
      ])
    );

    const rotateAnimation = Animated.timing(rotateAnim, {
      toValue: 1,
      duration: duration * 0.8,
      delay,
      easing: Easing.linear,
      useNativeDriver: useNative,
    });

    Animated.parallel([fallAnimation, swayAnimation, rotateAnimation]).start();
  }, [fallAnim, swayAnim, rotateAnim, duration, delay, index, useNative]);

  const translateY = fallAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, SCREEN_HEIGHT + 40],
  });

  const translateX = swayAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [startX - swayDistance, startX + swayDistance],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${(index % 2 === 0 ? 1 : -1) * 720}deg`],
  });

  const opacity = fallAnim.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        {
          width: sizeWidth,
          height: sizeHeight,
          backgroundColor: color,
          borderRadius: isCircle ? sizeWidth / 2 : isDiamond ? 2 : 3,
          transform: [
            { translateX },
            { translateY },
            { rotate },
            { rotateX: rotate },
          ],
          opacity,
        },
      ]}
    />
  );
};

interface CelebrationOverlayProps {
  visible: boolean;
  onDismiss: () => void;
  totalHabits?: number;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  visible,
  onDismiss,
  totalHabits = 0,
}) => {
  const { colors } = useTheme();
  const [cardScale] = useState(() => new Animated.Value(0.5));
  const [cardOpacity] = useState(() => new Animated.Value(0));
  const [trophyBounce] = useState(() => new Animated.Value(0));
  const useNative = Platform.OS !== 'web';

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(cardScale, {
        toValue: 0.8,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: useNative,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: useNative,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [cardScale, cardOpacity, useNative, onDismiss]);

  useEffect(() => {
    if (visible) {
      cardScale.setValue(0.6);
      cardOpacity.setValue(0);
      trophyBounce.setValue(0);

      Animated.parallel([
        Animated.spring(cardScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: useNative,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: useNative,
        }),
        Animated.sequence([
          Animated.delay(200),
          Animated.spring(trophyBounce, {
            toValue: 1,
            friction: 4,
            useNativeDriver: useNative,
          }),
        ]),
      ]).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, 6000);

      return () => clearTimeout(timer);
    }
  }, [visible, cardScale, cardOpacity, trophyBounce, useNative, handleDismiss]);

  if (!visible) return null;

  const trophyScale = trophyBounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.15],
  });

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* 55 Falling Confetti Paper Pieces */}
      {Array.from({ length: 55 }).map((_, i) => (
        <ConfettiPiece key={i} index={i} />
      ))}

      {/* Celebration Winning Banner Card */}
      <View style={styles.centerBackdrop}>
        <Animated.View
          style={[
            styles.celebrationCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.accent,
              transform: [{ scale: cardScale }],
              opacity: cardOpacity,
              shadowColor: colors.accent,
            },
          ]}
        >
          {/* Trophy Badge */}
          <Animated.View
            style={[
              styles.trophyCircle,
              {
                backgroundColor: `${colors.accent}20`,
                borderColor: `${colors.accent}40`,
                transform: [{ scale: trophyScale }],
              },
            ]}
          >
            <Ionicons name="trophy" size={44} color={colors.accent} />
          </Animated.View>

          <View style={[styles.pillBadge, { backgroundColor: `${colors.accent}1F` }]}>
            <Text style={[styles.pillBadgeText, { color: colors.accent }]}>
              PERFECT SCORE • 100%
            </Text>
          </View>

          <Text style={[styles.celebrationTitle, { color: colors.primaryText }]}>
            Day Won! 🎉
          </Text>

          <Text style={[styles.celebrationSubtitle, { color: colors.secondaryText }]}>
            You completed all {totalHabits > 0 ? totalHabits : ''} habits scheduled for today.
            Incredible consistency!
          </Text>

          <TouchableOpacity
            style={[styles.dismissBtn, { backgroundColor: colors.accent }]}
            activeOpacity={0.8}
            onPress={handleDismiss}
          >
            <Ionicons name="sparkles" size={18} color="#000" style={{ marginRight: 6 }} />
            <Text style={styles.dismissBtnText}>Keep Crushing It</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  confetti: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  centerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  celebrationCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 2,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 15,
  },
  trophyCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pillBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  celebrationSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  dismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
  },
  dismissBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
});
