// src/services/GoalsContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHabits } from './HabitContext';
import { calculateGoalProgress, Goal, GoalMilestone } from '../domain/goalEngine';
import { parseLocalDate } from '../domain/habitEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import { useDeviceIdentity } from './DeviceIdentityProvider';

const LEGACY_STORAGE_KEY = '@daymark_goals_v1';
const goalsStorageKey = (uid: string) => `@daymark_goals_v1:${uid}`;
const deleteQueueStorageKey = (uid: string) => `@daymark_goal_delete_queue_v1:${uid}`;

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
  const { deviceOwnerId, isReady } = useDeviceIdentity();
  const { habits, allHabits } = useHabits();
  const { preferences } = usePreferences();
  const todayDate = dateKeyInTimezone(new Date(), preferences.timezone);
  const todayReferenceDate = parseLocalDate(todayDate) ?? new Date();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [goalError, setGoalError] = useState<string | null>(null);

  const goalsRef = useRef(goals);
  const allHabitsRef = useRef(allHabits);
  useEffect(() => {
    goalsRef.current = goals;
    allHabitsRef.current = allHabits;
  });

  const saveLocal = useCallback(async (updated: Goal[], uid: string) => {
    const sorted = sortGoals(updated);
    setGoals(sorted);
    goalsRef.current = sorted;
    const targetKey = goalsStorageKey(uid);
    try { await AsyncStorage.setItem(targetKey, JSON.stringify(sorted)); }
    catch (error) { console.warn('Could not save goals locally:', error); setGoalError('Goals could not be saved on this device.'); }
  }, []);

  useEffect(() => {
    if (!isReady) return;
    let mounted = true;
    const load = async () => {
      setIsLoadingGoals(true);
      const storageKey = goalsStorageKey(deviceOwnerId);
      let local: Goal[] = [];
      try {
        let saved = await AsyncStorage.getItem(storageKey);
        if (!saved) {
          // Migrate from legacy guest key
          const legacySaved = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacySaved) {
            saved = legacySaved;
            await AsyncStorage.setItem(storageKey, legacySaved).catch(() => { });
          }
        }
        if (saved) local = JSON.parse(saved) as Goal[];
        if (mounted) {
          const sorted = sortGoals(local);
          setGoals(sorted);
          goalsRef.current = sorted;
        }
      } catch (error) {
        console.warn('Could not load local goals:', error);
        if (mounted) setGoalError('Saved goals could not be read from this device.');
      }
      if (mounted) setIsLoadingGoals(false);
    };
    void load();
    return () => { mounted = false; };
  }, [deviceOwnerId, isReady]);

  const persistAndSave = (updated: Goal[]) => {
    setGoalError(null);
    void saveLocal(updated, deviceOwnerId);
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
    persistAndSave([goal, ...goals]);
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
    persistAndSave(goals.map(goal => goal.id === id ? changed : goal));
    return {};
  };

  const archiveGoal = (id: string) => { const goal = goals.find(item => item.id === id); if (!goal) return; persistAndSave(goals.map(item => item.id === id ? { ...goal, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item)); };
  const restoreGoal = (id: string) => { const goal = goals.find(item => item.id === id); if (!goal) return; persistAndSave(goals.map(item => item.id === id ? { ...goal, archivedAt: null, updatedAt: new Date().toISOString() } : item)); };
  const deleteGoal = (id: string) => {
    persistAndSave(goals.filter(goal => goal.id !== id));
    // Persist legacy delete queue cleanup
    void (async () => {
      try {
        const deleteKey = deleteQueueStorageKey(deviceOwnerId);
        const saved = await AsyncStorage.getItem(deleteKey);
        const queue: string[] = saved ? JSON.parse(saved) : [];
        if (!queue.includes(id)) {
          await AsyncStorage.setItem(deleteKey, JSON.stringify([...queue, id]));
        }
      } catch { /* non-critical */ }
    })();
  };
  const completeGoal = (id: string) => {
    const goal = goals.find(item => item.id === id && !item.archivedAt);
    if (!goal) return { error: 'Goal is not active.' };
    if (!calculateGoalProgress(goal, habits, todayDate, todayReferenceDate).canComplete) return { error: 'Reach the configured target before completing this goal.' };
    persistAndSave(goals.map(item => item.id === id ? { ...goal, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item));
    return {};
  };
  const reopenGoal = (id: string) => { const goal = goals.find(item => item.id === id); if (!goal) return; persistAndSave(goals.map(item => item.id === id ? { ...goal, completedAt: null, updatedAt: new Date().toISOString() } : item)); };
  const markMilestoneReached = (goalId: string, milestoneId: string) => {
    const goal = goals.find(item => item.id === goalId);
    const milestone = goal?.milestones.find(item => item.id === milestoneId);
    if (!goal || !milestone) return { error: 'Milestone not found.' };
    const progress = calculateGoalProgress(goal, habits, todayDate, todayReferenceDate);
    if (!milestone.targetValue || progress.currentValue < milestone.targetValue) return { error: 'Reach the milestone target before marking it complete.' };
    persistAndSave(goals.map(item => item.id === goalId ? { ...goal, milestones: goal.milestones.map(m => m.id === milestoneId ? { ...m, reachedAt: m.reachedAt ?? new Date().toISOString() } : m), updatedAt: new Date().toISOString() } : item));
    return {};
  };
  const updateMilestone = (goalId: string, milestone: GoalMilestone) => {
    const goal = goals.find(item => item.id === goalId);
    if (!goal) return { error: 'Goal not found.' };
    const existing = goal.milestones.some(item => item.id === milestone.id);
    const milestones = existing ? goal.milestones.map(item => item.id === milestone.id ? milestone : item) : [...goal.milestones, milestone];
    const error = validateInput({ milestones }, false);
    if (error) return { error };
    persistAndSave(goals.map(item => item.id === goalId ? { ...goal, milestones, updatedAt: new Date().toISOString() } : item));
    return {};
  };
  const deleteMilestone = (goalId: string, milestoneId: string) => { const goal = goals.find(item => item.id === goalId); if (!goal) return; persistAndSave(goals.map(item => item.id === goalId ? { ...goal, milestones: goal.milestones.filter(m => m.id !== milestoneId), updatedAt: new Date().toISOString() } : item)); };

  const value: GoalsContextValue = { goals, isLoadingGoals, goalError, createGoal, updateGoal, archiveGoal, restoreGoal, deleteGoal, completeGoal, reopenGoal, markMilestoneReached, updateMilestone, deleteMilestone };
  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
};
