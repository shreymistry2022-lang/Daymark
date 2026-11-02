// App.tsx
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { AuthProvider, useAuth } from './src/services/AuthProvider';
import { HabitProvider, useHabits } from './src/services/HabitContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import { OnboardingScreen } from './src/screens/onboarding/OnboardingScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { CelebrationOverlay } from './src/components/CelebrationOverlay';

const queryClient = new QueryClient();

function RootNavigator() {
  const { user, isGuest, isLoading: isAuthLoading } = useAuth();
  const {
    hasCompletedOnboarding,
    completeOnboarding,
    isLoadingData,
    isCelebrationVisible,
    dismissCelebration,
    stats,
  } = useHabits();
  const { isDark, colors } = useTheme();

  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    dark: isDark,
    colors: {
      ...baseTheme.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.secondaryBackground,
      text: colors.primaryText,
      border: colors.border,
      notification: colors.accent,
    },
  };

  if (isAuthLoading || isLoadingData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {!user && !isGuest ? (
        <AuthScreen />
      ) : !hasCompletedOnboarding ? (
        <OnboardingScreen onComplete={completeOnboarding} />
      ) : (
        <BottomTabNavigator />
      )}
      <CelebrationOverlay
        visible={isCelebrationVisible}
        onDismiss={dismissCelebration}
        totalHabits={stats.totalToday}
      />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <HabitProvider>
            <QueryClientProvider client={queryClient}>
              <RootNavigator />
            </QueryClientProvider>
          </HabitProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
