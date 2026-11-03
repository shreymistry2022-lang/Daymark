import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useAchievements } from '../services/AchievementsContext';

interface Props { onClose?: () => void }
export const AchievementsScreen = ({ onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { achievements, isLoading, error } = useAchievements();
  const unlockedCount = achievements.filter(item => item.unlocked).length;
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={styles.header}><View><Text style={[styles.eyebrow, { color: colors.accent }]}>MILESTONES EARNED</Text><Text style={[styles.title, { color: colors.primaryText }]}>Achievements</Text><Text style={[styles.subtitle, { color: colors.secondaryText }]}>{unlockedCount} of {achievements.length} unlocked</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close achievements" onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={colors.primaryText} /></TouchableOpacity></View>
    <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}>
      {error && <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="cloud-offline-outline" size={18} color={colors.accent} /><Text style={[styles.noticeText, { color: colors.secondaryText }]}>{error}</Text></View>}
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={[styles.subtitle, { color: colors.secondaryText }]}>Loading achievement history…</Text></View> : achievements.map(item => <View key={item.key} style={[styles.card, { backgroundColor: colors.card, borderColor: item.unlocked ? `${colors.accent}80` : colors.border }]}><View style={[styles.badge, { backgroundColor: item.unlocked ? `${colors.accent}20` : colors.secondaryBackground }]}><Ionicons name={item.unlocked ? 'ribbon' : 'lock-closed-outline'} size={23} color={item.unlocked ? colors.accent : colors.mutedText} /></View><View style={styles.meta}><View style={styles.nameRow}><Text style={[styles.name, { color: colors.primaryText }]}>{item.title}</Text>{item.unlocked && <Ionicons accessibilityLabel="Unlocked" name="checkmark-circle" size={18} color={colors.accent} />}</View><Text style={[styles.description, { color: colors.secondaryText }]}>{item.description}</Text><View style={[styles.track, { backgroundColor: colors.secondaryBackground }]}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, item.progress / item.target * 100))}%`, backgroundColor: item.unlocked ? colors.accent : colors.mutedText }]} /></View><Text style={[styles.progress, { color: colors.mutedText }]}>{item.key === 'consistency' ? `${item.progress}% / ${item.target}% weekly completion` : `${item.progress} / ${item.target}`}{item.unlockedAt ? ` · Earned ${new Date(item.unlockedAt).toLocaleDateString()}` : ''}</Text></View></View>)}
    </ScrollView>
  </View>;
};
const styles = StyleSheet.create({ screen: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }, title: { fontSize: 29, fontWeight: '800', marginTop: 3 }, subtitle: { fontSize: 12, marginTop: 5 }, close: { padding: 8 }, list: { padding: spacing.lg, gap: spacing.md }, card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }, badge: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, meta: { flex: 1 }, nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, name: { fontSize: 15, fontWeight: '800' }, description: { fontSize: 12, lineHeight: 17, marginTop: 4 }, track: { height: 5, borderRadius: 4, marginTop: 11, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 4 }, progress: { fontSize: 10, marginTop: 6 }, notice: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, flexDirection: 'row', gap: 8 }, noticeText: { flex: 1, fontSize: 12 }, loading: { alignItems: 'center', padding: 30 } });
