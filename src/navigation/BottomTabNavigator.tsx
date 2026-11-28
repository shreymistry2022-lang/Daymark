// src/navigation/BottomTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TodayScreen } from '../screens/TodayScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { FocusTimerScreen } from '../screens/FocusTimerScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTheme } from '../theme/ThemeProvider';

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'today';

          if (route.name === 'Today') {
            iconName = focused ? 'checkmark-done' : 'checkmark-done-outline';
          } else if (route.name === 'Habits') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Timer') {
            iconName = focused ? 'timer' : 'timer-outline';
          } else if (route.name === 'Insights') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === 'Calendar') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return (
            <View
              style={{
                width: 42,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? `${colors.accent}22` : 'transparent',
              }}
            >
              <Ionicons name={iconName} size={20} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondaryText,
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: Math.max(insets.bottom, 10),
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1,
          borderTopWidth: 1,
          borderRadius: 999,
          height: 62,
          paddingBottom: Platform.OS === 'ios' ? 4 : 6,
          paddingTop: 6,
          paddingHorizontal: 8,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 1,
        },
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Habits" component={HabitsScreen} />
      <Tab.Screen name="Timer" component={FocusTimerScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
