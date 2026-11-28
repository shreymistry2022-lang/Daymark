// App.tsx
import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react';
import { Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { DeviceIdentityProvider, useDeviceIdentity } from './src/services/DeviceIdentityProvider';
import { HabitProvider, useHabits } from './src/services/HabitContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import { OnboardingScreen } from './src/screens/onboarding/OnboardingScreen';
import { CelebrationOverlay } from './src/components/CelebrationOverlay';
import { NotificationPermissionModal } from './src/components/NotificationPermissionModal';
import {
  checkNotificationPermissionStatus,
  COMPLETE_HABIT_ACTION,
  setupNotificationChannelsAsync,
  subscribeToReminderAlerts,
} from './src/services/localReminders';
import { checkForAppUpdates } from './src/services/updateService';
import { maybeRunDailyGoogleDriveBackup } from './src/services/googleDriveBackup';
import { SubscriptionProvider } from './src/services/SubscriptionProvider';
import { RoutinesProvider } from './src/services/RoutinesContext';
import { GoalsProvider } from './src/services/GoalsContext';
import { JournalProvider } from './src/services/JournalContext';
import { AchievementsProvider } from './src/services/AchievementsContext';
import { ReportsProvider } from './src/services/ReportsContext';
import { PreferencesProvider } from './src/services/PreferencesContext';

const queryClient = new QueryClient();

interface ErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled app render error:', error, info.componentStack);
  }

  private handleRecover = () => {
    this.setState({ hasError: false });
    if (!__DEV__ && Updates.isEnabled) {
      void Updates.reloadAsync().catch(() => {});
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0D0E12', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
            Daymark hit an unexpected display error. Tap below to reload cleanly.
          </Text>
          <TouchableOpacity
            onPress={this.handleRecover}
            activeOpacity={0.8}
            style={{ backgroundColor: '#7C3AED', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>Reload Daymark</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootNavigator() {
  const { deviceOwnerId, isReady: isIdentityReady } = useDeviceIdentity();
  const {
    habits,
    hasCompletedOnboarding,
    completeOnboarding,
    isLoadingData,
    isCelebrationVisible,
    dismissCelebration,
    toggleHabit,
    todayDateStr,
    exportDataJson,
    stats,
  } = useHabits();
  const { isDark, colors } = useTheme();
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  useEffect(() => {
    void setupNotificationChannelsAsync();
    return subscribeToReminderAlerts(alert => {
      Alert.alert(
        alert.title,
        alert.body,
        [{ text: 'OK' }]
      );
    });
  }, []);

  useEffect(() => {
    if (isLoadingData) return;
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      if (response.actionIdentifier !== COMPLETE_HABIT_ACTION) return;
      const ownerId = response.notification.request.content.data?.ownerId;
      if (typeof ownerId !== 'string') return;
      const target = habits.find(h => h.id === ownerId);
      if (target && !target.completedDates.includes(todayDateStr)) {
        toggleHabit(ownerId, todayDateStr);
      }
      void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
    };

    void Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [isLoadingData, habits, todayDateStr, toggleHabit]);

  useEffect(() => {
    // Check for OTA updates in background shortly after launch
    const timer = setTimeout(() => {
      void checkForAppUpdates(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoadingData) return;
    void maybeRunDailyGoogleDriveBackup(exportDataJson);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void maybeRunDailyGoogleDriveBackup(exportDataJson);
      }
    });
    return () => sub.remove();
  }, [isLoadingData, exportDataJson]);

  useEffect(() => {
    let active = true;
    const checkPermissionNeeded = async () => {
      if (!isIdentityReady || !hasCompletedOnboarding) return;
      try {
        const storageKey = `@daymark_permission_prompted_${deviceOwnerId}`;
        const alreadyPrompted = await AsyncStorage.getItem(storageKey);
        if (alreadyPrompted) return;

        const { granted } = await checkNotificationPermissionStatus();
        if (!granted && active) {
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
  }, [deviceOwnerId, isIdentityReady, hasCompletedOnboarding]);

  const handleDismissPermission = async () => {
    setShowPermissionPrompt(false);
    await AsyncStorage.setItem(`@daymark_permission_prompted_${deviceOwnerId}`, 'true').catch(() => {});
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {isIdentityReady && (
        <NavigationContainer theme={navTheme}>
          {!hasCompletedOnboarding ? (
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
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DeviceIdentityProvider>
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
                            <AppErrorBoundary>
                              <RootNavigator />
                            </AppErrorBoundary>
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
      </DeviceIdentityProvider>
    </SafeAreaProvider>
  );
}
