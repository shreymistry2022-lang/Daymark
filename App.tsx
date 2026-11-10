// App.tsx
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { NotificationPermissionModal } from './src/components/NotificationPermissionModal';
import { checkNotificationPermissionStatus } from './src/services/localReminders';
import { SubscriptionProvider } from './src/services/SubscriptionProvider';
import { RoutinesProvider } from './src/services/RoutinesContext';
import { GoalsProvider } from './src/services/GoalsContext';
import { JournalProvider } from './src/services/JournalContext';
import { AchievementsProvider } from './src/services/AchievementsContext';
import { ReportsProvider } from './src/services/ReportsContext';
import { PreferencesProvider } from './src/services/PreferencesContext';

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
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  useEffect(() => {
    let active = true;
    const checkPermissionNeeded = async () => {
      // Only prompt when authenticated and finished with onboarding
      if (!user || user.isGuest || !hasCompletedOnboarding) return;
      try {
        const storageKey = `@daymark_permission_prompted_${user.id}`;
        const alreadyPrompted = await AsyncStorage.getItem(storageKey);
        if (alreadyPrompted) return;

        const { granted } = await checkNotificationPermissionStatus();
        if (!granted && active) {
          // Delay briefly to let screen transitions finish smoothly
          const timer = setTimeout(() => {
            if (active) setShowPermissionPrompt(true);
          }, 800);
          return () => clearTimeout(timer);
        }
      } catch (err) {
        console.warn('Error checking permission prompt state:', err);
      }
    };

    void checkPermissionNeeded();
    return () => {
      active = false;
    };
  }, [user, hasCompletedOnboarding]);

  const handleDismissPermission = async () => {
    setShowPermissionPrompt(false);
    if (user?.id) {
      await AsyncStorage.setItem(`@daymark_permission_prompted_${user.id}`, 'true').catch(() => {});
    }
  };

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
      {!user || user.isGuest ? (
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
      <NotificationPermissionModal
        visible={showPermissionPrompt}
        onClose={handleDismissPermission}
        onGranted={handleDismissPermission}
      />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <PreferencesProvider>
            <ThemeProvider>
              <HabitProvider>
                <RoutinesProvider>
                  <GoalsProvider>
                    <JournalProvider>
                      <AchievementsProvider>
                        <ReportsProvider>
                          <QueryClientProvider client={queryClient}>
                            <RootNavigator />
                          </QueryClientProvider>
                        </ReportsProvider>
                      </AchievementsProvider>
                    </JournalProvider>
                  </GoalsProvider>
                </RoutinesProvider>
              </HabitProvider>
            </ThemeProvider>
          </PreferencesProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
