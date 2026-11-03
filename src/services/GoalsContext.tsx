import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { calculateGoalProgress, Goal, GoalMilestone } from '../domain/goalEngine';
import { parseLocalDate } from '../domain/habitEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';

const STORAGE_KEY = '@daymark_goals_v1';
const DELETE_QUEUE_KEY = '@daymark_goal_delete_queue_v1';
type GoalInput = Pick<Goal, 'name' | 'description' | 'category' | 'startDate' | 'targetDate' | 'targetValue' | 'unit' | 'habitIds' | 'milestones'>;

interface GoalsContextValue {
  goals: Goal[];
  isLoadingGoals: boolean;
  goalError: string | null;
  createGoal: (value: GoalInput) => { error?: string };
  updateGoal: (id: string, changes: Partial<GoalInput>) => { error?: string };
  archiveGoal: (id: string) => void;
  restoreGoal: (id: string) => void;
  deleteGoal: (id: string) => void;
  completeGoal: (id: string) => { error?: string };
  reopenGoal: (id: string) => void;
  markMilestoneReached: (goalId: string, milestoneId: string) => { error?: string };
  updateMilestone: (goalId: string, milestone: GoalMilestone) => { error?: string };
  deleteMilestone: (goalId: string, milestoneId: string) => void;
}

const GoalContext = createContext<GoalsContextValue | null>(null);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => { const random = Math.floor(Math.random() * 16); return (char === 'x' ? random : (random & 3) | 8).toString(16); });
const sortGoals = (values: Goal[]) => [...values].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const useGoals = () => {
  const value = useContext(GoalContext);
  if (!value) throw new Error('useGoals must be used within GoalsProvider');
  return value;
};

export const GoalsProvider = ({ children }: { children: ReactNode }) => {
  const { user, session } = useAuth();
  const { habits } = useHabits();
  const { preferences } = usePreferences();
  const todayDate = dateKeyInTimezone(new Date(), preferences.timezone);
  const todayReferenceDate = parseLocalDate(todayDate) ?? new Date();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [goalError, setGoalError] = useState<string | null>(null);

  const saveLocal = useCallback(async (updated: Goal[]) => {
    setGoals(sortGoals(updated));
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); }
    catch (error) { console.warn('Could not save goals locally:', error); setGoalError('Goals could not be saved on this device.'); }
  }, []);

  const syncGoal = useCallback(async (goal: Goal) => {
    if (!session || !user || user.isGuest || !isSupabaseConfigured) return;
    const { error } = await supabase.from('goals').upsert({
      id: goal.id, user_id: user.id, name: goal.name, description: goal.description,
      category: goal.category, start_date: goal.startDate, target_date: goal.targetDate,
      target_value: goal.targetValue, unit: goal.unit, archived_at: goal.archivedAt,
      completed_at: goal.completedAt, updated_at: goal.updatedAt,
    });
    if (error) throw error;
    const { error: clearLinksError } = await supabase.from('goal_habits').delete().eq('goal_id', goal.id);
    if (clearLinksError) throw clearLinksError;
    if (goal.habitIds.length) {
      const links = goal.habitIds.map(habitId => ({ goal_id: goal.id, habit_id: habitId }));
      const { error: linkError } = await supabase.from('goal_habits').upsert(links, { onConflict: 'goal_id,habit_id' });
      if (linkError) throw linkError;
    }
    const { error: clearMilestonesError } = await supabase.from('goal_milestones').delete().in('goal_id', [goal.id]);
    if (clearMilestonesError) throw clearMilestonesError;
    if (goal.milestones.length) {
      const milestones = goal.milestones.map(milestone => ({ id: milestone.id, goal_id: goal.id, title: milestone.title, target_value: milestone.targetValue, reached_at: milestone.reachedAt }));
      const { error: milestonesError } = await supabase.from('goal_milestones').upsert(milestones, { onConflict: 'id' });
      if (milestonesError) throw milestonesError;
    }
  }, [session, user]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoadingGoals(true);
      let local: Goal[] = [];
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) local = JSON.parse(saved) as Goal[];
        if (mounted) setGoals(sortGoals(local));
      } catch (error) { console.warn('Could not load local goals:', error); if (mounted) setGoalError('Saved goals could not be read from this device.'); }
      if (session && user && !user.isGuest && isSupabaseConfigured) {
        try {
          let pending: string[] = [];
          try { pending = JSON.parse((await AsyncStorage.getItem(DELETE_QUEUE_KEY)) ?? '[]') as string[]; } catch { pending = []; }
          const stillPending: string[] = [];
          for (const id of pending) {
            const result = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id);
            if (result.error) stillPending.push(id);
          }
          await AsyncStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(stillPending));
          const { data, error } = await supabase.from('goals').select('*, goal_habits(habit_id), goal_milestones(id,title,target_value,reached_at)').eq('user_id', user.id).order('created_at', { ascending: true });
          if (error) throw error;
          const cloud: Goal[] = (data ?? []).filter((row: any) => !stillPending.includes(row.id)).map((row: any) => ({
            id: row.id, name: row.name, description: row.description ?? '', category: row.category ?? 'Personal',
            startDate: row.start_date, targetDate: row.target_date ?? null, targetValue: row.target_value == null ? null : Number(row.target_value), unit: row.unit ?? '',
            habitIds: Array.isArray(row.goal_habits) ? row.goal_habits.map((link: any) => link.habit_id) : [],
            milestones: Array.isArray(row.goal_milestones) ? row.goal_milestones.map((milestone: any): GoalMilestone => ({ id: milestone.id, title: milestone.title, targetValue: milestone.target_value == null ? null : Number(milestone.target_value), reachedAt: milestone.reached_at ?? null })) : [],
            archivedAt: row.archived_at ?? null, completedAt: row.completed_at ?? null,
            createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
          }));
          if (!mounted) return;
          const cloudIds = new Set(cloud.map(goal => goal.id));
          const localMap = new Map(local.map(goal => [goal.id, goal]));
          const localWins: Goal[] = [];
          const mergedCloud = cloud.map(cloudGoal => {
            const localGoal = localMap.get(cloudGoal.id);
            if (!localGoal) return cloudGoal;
            if (localGoal.updatedAt > cloudGoal.updatedAt) { localWins.push(localGoal); return localGoal; }
            return cloudGoal;
          });
          const localOnly = local.filter(goal => !cloudIds.has(goal.id));
          const merged = sortGoals([...mergedCloud, ...localOnly]);
          setGoals(merged);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          for (const goal of [...localWins, ...localOnly]) await syncGoal(goal);
          setGoalError(null);
        } catch (error) { console.warn('Cloud goals remain available locally:', error); if (mounted) setGoalError('Cloud sync is unavailable. Goal changes are stored on this device and will retry next session.'); }
      }
      if (mounted) setIsLoadingGoals(false);
    };
    void load();
    return () => { mounted = false; };
  }, [session, user, syncGoal]);

  const persistAndSync = (updated: Goal[], changed?: Goal) => {
    setGoalError(null);
    void saveLocal(updated);
    if (changed) void syncGoal(changed).catch(error => { console.warn('Goal saved locally; cloud sync failed:', error); setGoalError('Goal saved on this device, but cloud sync failed. It will retry next session.'); });
  };

  const validateInput = (value: Partial<GoalInput>, requireHabits: boolean) => {
    if (value.name !== undefined && (!value.name.trim() || value.name.trim().length > 80)) return 'Enter a goal name under 80 characters.';
    if (value.description && value.description.length > 1000) return 'Keep the description under 1000 characters.';
    if (value.startDate !== undefined && !parseLocalDate(value.startDate)) return 'Choose a valid start date.';
    if (value.targetDate && !parseLocalDate(value.targetDate)) return 'Choose a valid target date.';
    const start = value.startDate;
    if (start && value.targetDate && value.targetDate < start) return 'Target date must be on or after the start date.';
    if (value.targetValue !== undefined && value.targetValue !== null && (!Number.isFinite(value.targetValue) || value.targetValue <= 0)) return 'Target value must be greater than zero.';
    if (requireHabits && !value.habitIds?.length) return 'Link at least one active habit to track goal progress.';
    if (value.habitIds?.some(id => !habits.some(habit => habit.id === id && !habit.archivedAt))) return 'Choose only active habits.';
    if (value.milestones?.some(milestone => !milestone.title.trim() || (milestone.targetValue !== null && (!Number.isFinite(milestone.targetValue) || milestone.targetValue <= 0)))) return 'Each milestone needs a title and a positive target value.';
    return null;
  };

  const createGoal = (value: GoalInput) => {
    const error = validateInput(value, true);
    if (error) return { error };
    const now = new Date().toISOString();
    const goal: Goal = { ...value, id: uuid(), name: value.name.trim(), description: value.description.trim(), category: value.category.trim() || 'Personal', unit: value.unit.trim(), habitIds: [...new Set(value.habitIds)], milestones: value.milestones.map(milestone => ({ ...milestone, title: milestone.title.trim(), reachedAt: null })), archivedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    persistAndSync([goal, ...goals], goal);
    return {};
  };

  const updateGoal = (id: string, changes: Partial<GoalInput>) => {
    const old = goals.find(goal => goal.id === id);
    if (!old) return { error: 'Goal not found.' };
    const candidate = { ...old, ...changes };
    const error = validateInput(candidate, true);
    if (error) return { error };
    const progress = calculateGoalProgress(candidate, habits, todayDate, todayReferenceDate);
    const changed: Goal = { ...candidate, name: candidate.name.trim(), description: candidate.description.trim(), category: candidate.category.trim() || 'Personal', unit: candidate.unit.trim(), habitIds: [...new Set(candidate.habitIds)], milestones: candidate.milestones.map(milestone => ({ ...milestone, title: milestone.title.trim() })), completedAt: progress.canComplete ? old.completedAt : null, updatedAt: new Date().toISOString() };
    persistAndSync(goals.map(goal => goal.id === id ? changed : goal), changed);
    return {};
  };

  const archiveGoal = (id: string) => { const goal = goals.find(item => item.id === id); if (!goal) return; const changed = { ...goal, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; persistAndSync(goals.map(item => item.id === id ? changed : item), changed); };
  const restoreGoal = (id: string) => { const goal = goals.find(item => item.id === id); if (!goal) return; const changed = { ...goal, archivedAt: null, updatedAt: new Date().toISOString() }; persistAndSync(goals.map(item => item.id === id ? changed : item), changed); };
  const deleteGoal = (id: string) => {
    const updated = goals.filter(goal => goal.id !== id);
    void saveLocal(updated);
    if (session && user && !user.isGuest && isSupabaseConfigured) void (async () => {
      let queue: string[] = [];
      try { queue = JSON.parse((await AsyncStorage.getItem(DELETE_QUEUE_KEY)) ?? '[]') as string[]; } catch { queue = []; }
      if (!queue.includes(id)) queue.push(id);
      await AsyncStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(queue));
      const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user.id);
      if (!error) await AsyncStorage.setItem(DELETE_QUEUE_KEY, JSON.stringify(queue.filter(value => value !== id)));
      else setGoalError('Goal deleted on this device; cloud deletion will retry next session.');
    })();
  };
  const completeGoal = (id: string) => {
    const goal = goals.find(item => item.id === id && !item.archivedAt);
    if (!goal) return { error: 'Goal is not active.' };
    if (!calculateGoalProgress(goal, habits, todayDate, todayReferenceDate).canComplete) return { error: 'Reach the configured target before completing this goal.' };
    const changed = { ...goal, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    persistAndSync(goals.map(item => item.id === id ? changed : item), changed);
    return {};
  };
  const reopenGoal = (id: string) => { const goal = goals.find(item => item.id === id); if (!goal) return; const changed = { ...goal, completedAt: null, updatedAt: new Date().toISOString() }; persistAndSync(goals.map(item => item.id === id ? changed : item), changed); };
  const markMilestoneReached = (goalId: string, milestoneId: string) => {
    const goal = goals.find(item => item.id === goalId);
    const milestone = goal?.milestones.find(item => item.id === milestoneId);
    if (!goal || !milestone) return { error: 'Milestone not found.' };
    const progress = calculateGoalProgress(goal, habits, todayDate, todayReferenceDate);
    if (!milestone.targetValue || progress.currentValue < milestone.targetValue) return { error: 'Reach the milestone target before marking it complete.' };
    const changed = { ...goal, milestones: goal.milestones.map(item => item.id === milestoneId ? { ...item, reachedAt: item.reachedAt ?? new Date().toISOString() } : item), updatedAt: new Date().toISOString() };
    persistAndSync(goals.map(item => item.id === goalId ? changed : item), changed);
    return {};
  };
  const updateMilestone = (goalId: string, milestone: GoalMilestone) => {
    const goal = goals.find(item => item.id === goalId);
    if (!goal) return { error: 'Goal not found.' };
    const existing = goal.milestones.some(item => item.id === milestone.id);
    const milestones = existing ? goal.milestones.map(item => item.id === milestone.id ? milestone : item) : [...goal.milestones, milestone];
    const error = validateInput({ milestones }, false);
    if (error) return { error };
    const changed = { ...goal, milestones, updatedAt: new Date().toISOString() };
    persistAndSync(goals.map(item => item.id === goalId ? changed : item), changed);
    return {};
  };
  const deleteMilestone = (goalId: string, milestoneId: string) => { const goal = goals.find(item => item.id === goalId); if (!goal) return; const changed = { ...goal, milestones: goal.milestones.filter(item => item.id !== milestoneId), updatedAt: new Date().toISOString() }; persistAndSync(goals.map(item => item.id === goalId ? changed : item), changed); };

  const value: GoalsContextValue = { goals, isLoadingGoals, goalError, createGoal, updateGoal, archiveGoal, restoreGoal, deleteGoal, completeGoal, reopenGoal, markMilestoneReached, updateMilestone, deleteMilestone };
  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
};
