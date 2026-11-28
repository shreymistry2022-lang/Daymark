import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import { useHabits } from './HabitContext';
import { calculateGoalProgress, Goal, GoalMilestone } from '../domain/goalEngine';
import { parseLocalDate } from '../domain/habitEngine';
import { usePreferences } from './PreferencesContext';
import { dateKeyInTimezone } from '../domain/preferencesEngine';
import {
  createUuid,
  isOwnershipOrConflictError,
  isTransientCloudError,
  isValidUuid,
  readStorageJson,
  resolveCloudAuth,
  writeStorageJson,
} from './cloudSyncHelpers';

const LEGACY_STORAGE_KEY = '@daymark_goals_v1';
const LEGACY_DELETE_KEY = '@daymark_goal_delete_queue_v1';
const goalsStorageKey = (uid?: string) => uid ? `@daymark_goals_v1:${uid}` : LEGACY_STORAGE_KEY;
const deleteQueueStorageKey = (uid?: string) => uid ? `@daymark_goal_delete_queue_v1:${uid}` : LEGACY_DELETE_KEY;
const pendingSyncStorageKey = (uid?: string) => `@daymark_goal_pending_sync_v1:${uid ?? 'guest'}`;

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
  retryGoalSync: () => Promise<void>;
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
  const { habits, allHabits, isLoadingData: isLoadingHabits, ensureHabitsSynced } = useHabits();
  const { preferences } = usePreferences();
  const todayDate = dateKeyInTimezone(new Date(), preferences.timezone);
  const todayReferenceDate = parseLocalDate(todayDate) ?? new Date();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [goalError, setGoalError] = useState<string | null>(null);

  const userRef = useRef(user);
  const sessionRef = useRef(session);
  const goalsRef = useRef(goals);
  const allHabitsRef = useRef(allHabits);
  useEffect(() => {
    userRef.current = user;
    sessionRef.current = session;
    goalsRef.current = goals;
    allHabitsRef.current = allHabits;
  });

  const activeUid = user?.id && !user.isGuest ? user.id : undefined;

  const saveLocal = useCallback(async (updated: Goal[], uid?: string) => {
    const sorted = sortGoals(updated);
    setGoals(sorted);
    goalsRef.current = sorted;
    const targetKey = goalsStorageKey(uid ?? (userRef.current?.id && !userRef.current.isGuest ? userRef.current.id : undefined));
    try { await AsyncStorage.setItem(targetKey, JSON.stringify(sorted)); }
    catch (error) { console.warn('Could not save goals locally:', error); setGoalError('Goals could not be saved on this device.'); }
  }, []);

  const markGoalPending = useCallback(async (uid: string, goalId: string) => {
    const pending = await readStorageJson<string[]>(pendingSyncStorageKey(uid), []);
    if (!pending.includes(goalId)) {
      await writeStorageJson(pendingSyncStorageKey(uid), [...pending, goalId]).catch(() => { });
    }
  }, []);

  const clearGoalPending = useCallback(async (uid: string, goalId: string) => {
    const pending = await readStorageJson<string[]>(pendingSyncStorageKey(uid), []);
    if (pending.includes(goalId)) {
      await writeStorageJson(pendingSyncStorageKey(uid), pending.filter(id => id !== goalId)).catch(() => { });
    }
  }, []);

  const syncGoal = useCallback(async (goal: Goal) => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;

    let activeGoal = goal;
    if (!isValidUuid(activeGoal.id)) {
      const healedId = createUuid();
      const updated = goalsRef.current.map(g => (g.id === activeGoal.id ? { ...activeGoal, id: healedId } : g));
      activeGoal = { ...activeGoal, id: healedId };
      await saveLocal(updated, cloudAuth.userId);
    }

    const validHabitIds = activeGoal.habitIds.filter(id => allHabitsRef.current.some(h => h.id === id));
    const syncedHabitIds = validHabitIds.length > 0 ? await ensureHabitsSynced(validHabitIds) : [];

    const buildRow = (target: Goal) => ({
      id: target.id, user_id: cloudAuth.userId, name: target.name, description: target.description,
      category: target.category, start_date: target.startDate, target_date: target.targetDate,
      target_value: target.targetValue, unit: target.unit, archived_at: target.archivedAt,
      completed_at: target.completedAt, created_at: target.createdAt, updated_at: target.updatedAt,
    });

    const { error } = await supabase.from('goals').upsert(buildRow(activeGoal), { onConflict: 'id' });
    if (error) {
      if (isOwnershipOrConflictError(error)) {
        const oldId = activeGoal.id;
        const healedId = createUuid();
        const cloned = { ...activeGoal, id: healedId };
        const updated = goalsRef.current.map(g => (g.id === oldId ? cloned : g));
        await saveLocal(updated, cloudAuth.userId);
        await clearGoalPending(cloudAuth.userId, oldId);
        activeGoal = cloned;
        const retryResult = await supabase.from('goals').upsert(buildRow(activeGoal), { onConflict: 'id' });
        if (retryResult.error) throw retryResult.error;
      } else {
        throw error;
      }
    }

    const { error: clearLinksError } = await supabase.from('goal_habits').delete().eq('goal_id', activeGoal.id);
    if (clearLinksError) throw clearLinksError;
    if (syncedHabitIds.length) {
      const links = syncedHabitIds.map(habitId => ({ goal_id: activeGoal.id, habit_id: habitId }));
      const { error: linkError } = await supabase.from('goal_habits').insert(links);
      if (linkError) throw linkError;
    }

    const { error: clearMilestonesError } = await supabase.from('goal_milestones').delete().eq('goal_id', activeGoal.id);
    if (clearMilestonesError) throw clearMilestonesError;
    if (activeGoal.milestones.length) {
      const milestones = activeGoal.milestones.map(milestone => ({
        id: isValidUuid(milestone.id) ? milestone.id : createUuid(), goal_id: activeGoal.id, title: milestone.title,
        target_value: milestone.targetValue, reached_at: milestone.reachedAt,
      }));
      const { error: milestonesError } = await supabase.from('goal_milestones').insert(milestones);
      if (milestonesError) throw milestonesError;
    }

    if (syncedHabitIds.length < validHabitIds.length) {
      await markGoalPending(cloudAuth.userId, activeGoal.id);
    } else {
      await clearGoalPending(cloudAuth.userId, activeGoal.id);
    }
  }, [clearGoalPending, ensureHabitsSynced, markGoalPending, saveLocal]);

  const retryGoalSync = useCallback(async () => {
    const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
    if (!cloudAuth) return;
    const pendingIds = await readStorageJson<string[]>(pendingSyncStorageKey(cloudAuth.userId), []);
    const targets = pendingIds.length
      ? pendingIds.map(id => goalsRef.current.find(g => g.id === id)).filter((g): g is Goal => Boolean(g))
      : goalsRef.current;
    try {
      for (const target of targets) {
        await syncGoal(target);
      }
      for (const id of pendingIds) {
        if (!goalsRef.current.some(g => g.id === id)) {
          await clearGoalPending(cloudAuth.userId, id);
        }
      }
      setGoalError(null);
    } catch (error) {
      console.warn('Pending goal cloud sync retry failed:', error);
    }
  }, [clearGoalPending, syncGoal]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void retryGoalSync();
      }
    });
    return () => sub.remove();
  }, [retryGoalSync]);

  useEffect(() => {
    if (!goalError || isLoadingHabits) return;
    const timer = setInterval(() => {
      void retryGoalSync();
    }, 15000);
    return () => clearInterval(timer);
  }, [goalError, isLoadingHabits, retryGoalSync]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoadingGoals(true);
      const storageKey = goalsStorageKey(activeUid);
      const deleteKey = deleteQueueStorageKey(activeUid);

      let local: Goal[] = [];
      try {
        let saved = await AsyncStorage.getItem(storageKey);
        if (!saved && activeUid) {
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

      if (isLoadingHabits) return;

      const cloudAuth = await resolveCloudAuth(user, session);
      if (cloudAuth) {
        try {
          const pendingDeletes = await readStorageJson<string[]>(deleteKey, []);
          const legacyDeletes = deleteKey !== LEGACY_DELETE_KEY ? await readStorageJson<string[]>(LEGACY_DELETE_KEY, []) : [];
          const combinedDeletes = Array.from(new Set([...pendingDeletes, ...legacyDeletes]));
          const stillPending: string[] = [];
          for (const id of combinedDeletes) {
            const result = await supabase.from('goals').delete().eq('id', id).eq('user_id', cloudAuth.userId);
            if (result.error) stillPending.push(id);
          }
          await writeStorageJson(deleteKey, stillPending).catch(() => { });
          if (deleteKey !== LEGACY_DELETE_KEY) {
            await AsyncStorage.removeItem(LEGACY_DELETE_KEY).catch(() => { });
          }

          const pendingSyncIds = await readStorageJson<string[]>(pendingSyncStorageKey(cloudAuth.userId), []);

          const { data, error } = await supabase
            .from('goals')
            .select('*, goal_habits(habit_id), goal_milestones(id,title,target_value,reached_at)')
            .eq('user_id', cloudAuth.userId)
            .order('created_at', { ascending: true });
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
            const hasMissingCloudLinks = localGoal.updatedAt === cloudGoal.updatedAt && (
              localGoal.habitIds.length > cloudGoal.habitIds.length ||
              localGoal.milestones.length > cloudGoal.milestones.length
            );
            if (localGoal.updatedAt > cloudGoal.updatedAt || pendingSyncIds.includes(localGoal.id) || hasMissingCloudLinks) {
              localWins.push(localGoal);
              return localGoal;
            }
            return cloudGoal;
          });
          const localOnly = local.filter(goal => !cloudIds.has(goal.id));
          const merged = sortGoals([...mergedCloud, ...localOnly]);
          setGoals(merged);
          goalsRef.current = merged;
          await AsyncStorage.setItem(storageKey, JSON.stringify(merged));

          for (const goal of [...localWins, ...localOnly]) {
            try {
              await syncGoal(goal);
            } catch (syncErr) {
              await markGoalPending(cloudAuth.userId, goal.id);
              throw syncErr;
            }
          }
          setGoalError(null);
        } catch (error) {
          console.warn('Cloud goals remain available locally:', error);
          if (mounted && !isTransientCloudError(error)) {
            setGoalError('Cloud sync could not complete. Goal changes are stored on this device.');
          }
        }
      }
      if (mounted) setIsLoadingGoals(false);
    };
    void load();
    return () => { mounted = false; };
  }, [activeUid, isLoadingHabits, markGoalPending, session, syncGoal, user]);

  const persistAndSync = (updated: Goal[], changed?: Goal) => {
    setGoalError(null);
    void saveLocal(updated);
    if (changed) {
      void (async () => {
        const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
        if (!cloudAuth) return;
        try {
          await syncGoal(changed);
          setGoalError(null);
        } catch (error) {
          console.warn('Goal saved locally; cloud sync deferred:', error);
          await markGoalPending(cloudAuth.userId, changed.id);
          if (!isTransientCloudError(error)) {
            setGoalError('Goal saved on this device, but cloud sync failed. Tap to retry.');
          }
        }
      })();
    }
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
    void (async () => {
      const cloudAuth = await resolveCloudAuth(userRef.current, sessionRef.current);
      if (!cloudAuth) return;
      await clearGoalPending(cloudAuth.userId, id);
      const deleteKey = deleteQueueStorageKey(cloudAuth.userId);
      const queue = await readStorageJson<string[]>(deleteKey, []);
      if (!queue.includes(id)) queue.push(id);
      await writeStorageJson(deleteKey, queue).catch(() => { });
      const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', cloudAuth.userId);
      if (!error) await writeStorageJson(deleteKey, queue.filter(value => value !== id)).catch(() => { });
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

  const value: GoalsContextValue = { goals, isLoadingGoals, goalError, createGoal, updateGoal, archiveGoal, restoreGoal, deleteGoal, completeGoal, reopenGoal, markMilestoneReached, updateMilestone, deleteMilestone, retryGoalSync };
  return <GoalContext.Provider value={value}>{children}</GoalContext.Provider>;
};
