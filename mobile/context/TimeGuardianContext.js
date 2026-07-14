/**
 * TimeGuardianContext.js
 * Added: dailyTasks, recurringTasks state and actions.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  getRotationAnchor, setRotationAnchor,
  getWorkHours, saveWorkHours,
  getRotationSchedule, saveRotationSchedule, updateRotationSlot,
  getScheduleChangeLog, addScheduleChangeLog,
  getCustomBlocks, addCustomBlock, updateCustomBlock, deleteCustomBlock, toggleCustomBlockActive,
  addLogEntry, getRecentLogEntries,
  getEnergyEntries, getEnergyChartData, upsertEnergyEntry,
  getDailyTasks, getDailyTasksForDate, addDailyTask, updateDailyTask, deleteDailyTask,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask,
  toggleRecurringTaskActive, getRecurringTasksForDay,
  DEFAULT_WORK_HOURS, DEFAULT_ROTATION_SCHEDULE,
} from '../timeguardian/storage/repository';
import { todayStr, nowTimeStr, getDayOfWeek } from '../timeguardian/logic/dayBlocks';

const TimeGuardianContext = createContext(null);

const initialState = {
  isLoading         : true,
  anchorDate        : null,
  workHours         : DEFAULT_WORK_HOURS,
  rotationSchedule  : DEFAULT_ROTATION_SCHEDULE,
  scheduleChangeLog : [],
  customBlocks      : [],
  recurringTasks    : [],
  logEntries        : [],
  energyEntries     : [],
  energyChartData   : [],
  todayEnergy       : null,
  // dailyTasks are loaded per-date on demand, not stored globally
};

const A = {
  BOOTSTRAP         : 'BOOTSTRAP',
  SET_ANCHOR        : 'SET_ANCHOR',
  SET_WORK_HOURS    : 'SET_WORK_HOURS',
  SET_ROTATION      : 'SET_ROTATION',
  SET_CHANGE_LOG    : 'SET_CHANGE_LOG',
  SET_BLOCKS        : 'SET_BLOCKS',
  SET_RECURRING     : 'SET_RECURRING',
  SET_LOGS          : 'SET_LOGS',
  SET_ENERGY        : 'SET_ENERGY',
};

function reducer(state, action) {
  switch (action.type) {
    case A.BOOTSTRAP      : return { ...state, isLoading: false, ...action.payload };
    case A.SET_ANCHOR     : return { ...state, anchorDate: action.payload };
    case A.SET_WORK_HOURS : return { ...state, workHours: action.payload };
    case A.SET_ROTATION   : return { ...state, rotationSchedule: action.payload };
    case A.SET_CHANGE_LOG : return { ...state, scheduleChangeLog: action.payload };
    case A.SET_BLOCKS     : return { ...state, customBlocks: action.payload };
    case A.SET_RECURRING  : return { ...state, recurringTasks: action.payload };
    case A.SET_LOGS       : return { ...state, logEntries: action.payload };
    case A.SET_ENERGY     : return { ...state, ...action.payload };
    default               : return state;
  }
}

export function TimeGuardianProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    (async () => {
      const [
        anchor, workHours, rotationSchedule, scheduleChangeLog,
        blocks, recurringTasks, logs, energyEntries, energyChartData,
      ] = await Promise.all([
        getRotationAnchor(),
        getWorkHours(),
        getRotationSchedule(),
        getScheduleChangeLog(),
        getCustomBlocks(),
        getRecurringTasks(),
        getRecentLogEntries(),
        getEnergyEntries(),
        getEnergyChartData(7),
      ]);

      const today       = todayStr();
      const todayList   = energyEntries.filter((e) => e.date === today);
      const todayEnergy = todayList.length > 0
        ? todayList.sort((a, b) => (a.time > b.time ? -1 : 1))[0]
        : null;

      dispatch({
        type: A.BOOTSTRAP,
        payload: {
          anchorDate: anchor?.anchor_date ?? null,
          workHours, rotationSchedule, scheduleChangeLog,
          customBlocks: blocks, recurringTasks,
          logEntries: logs, energyEntries, energyChartData, todayEnergy,
        },
      });
    })();
  }, []);

  // ── Anchor ────────────────────────────────────────────────────────────────
  const saveAnchorDate = useCallback(async (dateStr, reason = '') => {
    const old = state.anchorDate;
    await setRotationAnchor(dateStr);
    if (reason) await addScheduleChangeLog('anchor_date', old, dateStr, reason);
    dispatch({ type: A.SET_ANCHOR, payload: dateStr });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.anchorDate]);

  // ── Work Hours ────────────────────────────────────────────────────────────
  const updateWorkHours = useCallback(async (hours, reason) => {
    await saveWorkHours(hours);
    await addScheduleChangeLog('work_hours', state.workHours, hours, reason);
    dispatch({ type: A.SET_WORK_HOURS, payload: hours });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.workHours]);

  // ── Rotation ──────────────────────────────────────────────────────────────
  const updateRotationSlotById = useCallback(async (index, changes, reason) => {
    const old = state.rotationSchedule.find((s) => s.index === index);
    await updateRotationSlot(index, changes);
    await addScheduleChangeLog('rotation_slot', old, { ...old, ...changes }, reason);
    dispatch({ type: A.SET_ROTATION, payload: await getRotationSchedule() });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.rotationSchedule]);

  const resetRotationSchedule = useCallback(async (reason) => {
    await saveRotationSchedule(DEFAULT_ROTATION_SCHEDULE);
    await addScheduleChangeLog('rotation_slot', state.rotationSchedule, DEFAULT_ROTATION_SCHEDULE, reason || 'Reset to defaults');
    dispatch({ type: A.SET_ROTATION, payload: DEFAULT_ROTATION_SCHEDULE });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.rotationSchedule]);

  // ── Custom Blocks ─────────────────────────────────────────────────────────
  const refreshBlocks = useCallback(async () => {
    dispatch({ type: A.SET_BLOCKS, payload: await getCustomBlocks() });
  }, []);
  const createBlock = useCallback(async (b)          => { await addCustomBlock(b);              await refreshBlocks(); }, [refreshBlocks]);
  const editBlock   = useCallback(async (id, changes) => { await updateCustomBlock(id, changes); await refreshBlocks(); }, [refreshBlocks]);
  const removeBlock = useCallback(async (id)          => { await deleteCustomBlock(id);          await refreshBlocks(); }, [refreshBlocks]);
  const toggleBlock = useCallback(async (id)          => { await toggleCustomBlockActive(id);    await refreshBlocks(); }, [refreshBlocks]);

  // ── Daily Tasks (per-date, loaded on demand in day screen) ────────────────
  const fetchDailyTasksForDate = useCallback(async (date) => {
    return getDailyTasksForDate(date);
  }, []);

  const createDailyTask = useCallback(async (task) => {
    return addDailyTask(task);
  }, []);

  const editDailyTask = useCallback(async (id, changes) => {
    return updateDailyTask(id, changes);
  }, []);

  const removeDailyTask = useCallback(async (id) => {
    return deleteDailyTask(id);
  }, []);

  const toggleDailyTaskDone = useCallback(async (id, current) => {
    return updateDailyTask(id, { done: !current });
  }, []);

  const toggleDailyTaskProtected = useCallback(async (id, current) => {
    return updateDailyTask(id, { protected: !current });
  }, []);

  // ── Recurring Tasks ───────────────────────────────────────────────────────
  const refreshRecurring = useCallback(async () => {
    dispatch({ type: A.SET_RECURRING, payload: await getRecurringTasks() });
  }, []);

  const createRecurringTask = useCallback(async (task) => {
    await addRecurringTask(task);
    await refreshRecurring();
  }, [refreshRecurring]);

  const editRecurringTask = useCallback(async (id, changes) => {
    await updateRecurringTask(id, changes);
    await refreshRecurring();
  }, [refreshRecurring]);

  const removeRecurringTask = useCallback(async (id) => {
    await deleteRecurringTask(id);
    await refreshRecurring();
  }, [refreshRecurring]);

  const toggleRecurring = useCallback(async (id) => {
    await toggleRecurringTaskActive(id);
    await refreshRecurring();
  }, [refreshRecurring]);

  /**
   * Returns merged task list for a date:
   * one-off tasks + active recurring tasks for that day-of-week.
   * Sorted by time.
   */
  const getTasksForDate = useCallback(async (date) => {
    const dayOfWeek  = getDayOfWeek(date);
    const [oneOff, recurring] = await Promise.all([
      getDailyTasksForDate(date),
      getRecurringTasksForDay(dayOfWeek),
    ]);
    // Merge and sort by time
    return [...oneOff, ...recurring.map((r) => ({ ...r, isRecurring: true, date }))]
      .sort((a, b) => (a.time < b.time ? -1 : 1));
  }, []);

  // ── Log ───────────────────────────────────────────────────────────────────
  const logEntry = useCallback(async (entry) => {
    const saved = await addLogEntry(entry);
    dispatch({ type: A.SET_LOGS, payload: await getRecentLogEntries() });
    return saved;
  }, []);

  // ── Energy ────────────────────────────────────────────────────────────────
  const checkInEnergy = useCallback(async (level, cause = null) => {
    const today = todayStr();
    await upsertEnergyEntry(today, nowTimeStr(), level, cause);
    const [energyEntries, energyChartData] = await Promise.all([getEnergyEntries(), getEnergyChartData(7)]);
    const todayList   = energyEntries.filter((e) => e.date === today);
    const todayEnergy = todayList.length > 0 ? todayList.sort((a, b) => (a.time > b.time ? -1 : 1))[0] : null;
    dispatch({ type: A.SET_ENERGY, payload: { energyEntries, energyChartData, todayEnergy } });
  }, []);

  return (
    <TimeGuardianContext.Provider value={{
      ...state,
      saveAnchorDate,
      updateWorkHours,
      updateRotationSlotById, resetRotationSchedule,
      createBlock, editBlock, removeBlock, toggleBlock,
      fetchDailyTasksForDate, createDailyTask, editDailyTask, removeDailyTask,
      toggleDailyTaskDone, toggleDailyTaskProtected,
      createRecurringTask, editRecurringTask, removeRecurringTask, toggleRecurring,
      getTasksForDate,
      logEntry,
      checkInEnergy,
    }}>
      {children}
    </TimeGuardianContext.Provider>
  );
}

export function useTimeGuardian() {
  const ctx = useContext(TimeGuardianContext);
  if (!ctx) throw new Error('useTimeGuardian must be used within TimeGuardianProvider');
  return ctx;
}
