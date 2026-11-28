import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useAchievements } from '../services/AchievementsContext';
import { MinimalModalHeader } from '../components/MinimalModalHeader';

interface Props {
  onClose?: () => void;
}

export const AchievementsScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { achievements, isLoading, error } = useAchievements();
  const unlockedCount = achievements.filter(item => item.unlocked).length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <MinimalModalHeader
        title="Achievements"
        subtitle={`${unlockedCount} of ${achievements.length} unlocked`}
        colors={colors}
        onClose={onClose}
        closeIcon="close"
        closeAccessibilityLabel="Close achievements"
        showHandle
      />

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}>
        {error && (
          <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>{error}</Text>
          </View>
        )}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Loading achievement history…</Text>
          </View>
        ) : (
          achievements.map(item => {
            const pct = Math.max(0, Math.min(100, (item.progress / item.target) * 100));
            return (
              <View
                key={item.key}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: item.unlocked ? `${colors.accent}70` : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: item.unlocked ? `${colors.accent}20` : colors.secondaryBackground },
                  ]}
                >
                  <Ionicons
                    name={item.unlocked ? 'ribbon' : 'lock-closed-outline'}
                    size={22}
                    color={item.unlocked ? colors.accent : colors.mutedText}
                  />
                </View>

                <View style={styles.meta}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: colors.primaryText }]}>{item.title}</Text>
                    {item.unlocked && (
                      <Ionicons accessibilityLabel="Unlocked" name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </View>
                  <Text style={[styles.description, { color: colors.secondaryText }]}>{item.description}</Text>

                  <View style={[styles.track, { backgroundColor: colors.secondaryBackground }]}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${pct}%`, backgroundColor: item.unlocked ? colors.accent : colors.mutedText },
                      ]}
                    />
                  </View>

                  <Text style={[styles.progress, { color: colors.mutedText }]}>
                    {item.key === 'consistency'
                      ? `${item.progress}% / ${item.target}% weekly completion`
                      : `${item.progress} / ${item.target}`}
                    {item.unlockedAt ? ` · Earned ${new Date(item.unlockedAt).toLocaleDateString()}` : ''}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.sm + 4 },
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  badge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  track: { height: 6, borderRadius: radii.full, marginTop: 12, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.full },
  progress: { fontSize: 11, marginTop: 6 },
  notice: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, flexDirection: 'row', gap: 8 },
  noticeText: { flex: 1, fontSize: 12 },
  loading: { alignItems: 'center', padding: 36 },
  loadingText: { fontSize: 13, marginTop: 10 },
});
