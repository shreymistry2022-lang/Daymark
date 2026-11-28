import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  StyleProp,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';

/**
 * Safely triggers a lightweight LayoutAnimation ease transition for collapsible drawers.
 */
export function triggerLayoutEase() {
  try {
    LayoutAnimation?.configureNext?.(LayoutAnimation.Presets.easeInEaseOut);
  } catch {
    // Ignore on environments where LayoutAnimation is unavailable.
  }
}

interface AnimatedMonthContainerProps {
  year: number;
  month: number;
  onShiftMonth: (delta: number) => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Wraps a monthly calendar grid with interactive horizontal swipe drag tracking
 * and smooth native-driver slide + fade transitions across month changes.
 */
export function AnimatedMonthContainer({
  year,
  month,
  onShiftMonth,
  style,
  children,
}: AnimatedMonthContainerProps) {
  const [slideX] = useState(() => new Animated.Value(0));
  const [fadeOpacity] = useState(() => new Animated.Value(1));
  const prevMonthRef = useRef({ year, month });

  useEffect(() => {
    const prev = prevMonthRef.current;
    const prevTotal = prev.year * 12 + prev.month;
    const nextTotal = year * 12 + month;
    if (prevTotal === nextTotal) return;

    prevMonthRef.current = { year, month };
    const direction = nextTotal > prevTotal ? 1 : -1;

    slideX.stopAnimation();
    fadeOpacity.stopAnimation();
    slideX.setValue(direction * 30);
    fadeOpacity.setValue(0.28);

    Animated.parallel([
      Animated.timing(slideX, {
        toValue: 0,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeOpacity, {
        toValue: 1,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [year, month, slideX, fadeOpacity]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 14 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.25,
        onPanResponderMove: (_, gs) => {
          const clampedDx = Math.max(-90, Math.min(90, gs.dx * 0.45));
          slideX.setValue(clampedDx);
          fadeOpacity.setValue(Math.max(0.55, 1 - Math.abs(gs.dx) / 260));
        },
        onPanResponderRelease: (_, gs) => {
          const isHorizontal = Math.abs(gs.dx) > Math.abs(gs.dy) * 1.15;
          const swipeNext = isHorizontal && (gs.dx < -42 || gs.vx < -0.35);
          const swipePrev = isHorizontal && (gs.dx > 42 || gs.vx > 0.35);
          const delta = swipeNext ? 1 : swipePrev ? -1 : 0;

          if (delta !== 0) {
            Animated.parallel([
              Animated.timing(slideX, {
                toValue: -delta * 26,
                duration: 75,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(fadeOpacity, {
                toValue: 0.25,
                duration: 75,
                useNativeDriver: true,
              }),
            ]).start(() => {
              onShiftMonth(delta);
            });
            return;
          }

          Animated.parallel([
            Animated.spring(slideX, {
              toValue: 0,
              friction: 8,
              tension: 120,
              useNativeDriver: true,
            }),
            Animated.timing(fadeOpacity, {
              toValue: 1,
              duration: 140,
              useNativeDriver: true,
            }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(slideX, {
              toValue: 0,
              friction: 8,
              tension: 120,
              useNativeDriver: true,
            }),
            Animated.timing(fadeOpacity, {
              toValue: 1,
              duration: 140,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [slideX, fadeOpacity, onShiftMonth],
  );

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: fadeOpacity,
          transform: [{ translateX: slideX }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

interface AnimatedPopTouchableProps extends TouchableOpacityProps {
  /** Initial resting scale ratio on press-in before springing back (default 0.9). */
  pressScale?: number;
  /** Optional layout wrapper style applied to the outer Animated.View (e.g. flex grid slot). */
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Touchable button with native-driver spring pop feedback for calendar tiles and checkboxes.
 * Wraps TouchableOpacity inside Animated.View rather than createAnimatedComponent(TouchableOpacity)
 * so Fabric host-view ref attachment remains reliable on React Native 0.88+.
 */
export const AnimatedPopTouchable = React.memo(function AnimatedPopTouchable({
  pressScale = 0.9,
  containerStyle,
  style,
  onPressIn,
  onPressOut,
  onPress,
  activeOpacity = 0.82,
  children,
  ...rest
}: AnimatedPopTouchableProps) {
  const [scale] = useState(() => new Animated.Value(1));

  const handlePressIn: NonNullable<TouchableOpacityProps['onPressIn']> = (event) => {
    Animated.timing(scale, {
      toValue: pressScale,
      duration: 65,
      useNativeDriver: true,
    }).start();
    onPressIn?.(event);
  };

  const handlePressOut: NonNullable<TouchableOpacityProps['onPressOut']> = (event) => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 200,
      useNativeDriver: true,
    }).start();
    onPressOut?.(event);
  };

  const handlePress: NonNullable<TouchableOpacityProps['onPress']> = (event) => {
    scale.setValue(pressScale);
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 190,
      useNativeDriver: true,
    }).start();
    onPress?.(event);
  };

  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <TouchableOpacity
        {...rest}
        activeOpacity={activeOpacity}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress ? handlePress : undefined}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
});
