/**
 * TimeGuardianContext.js — v5
 * Added: weekPlans, versioned workHours, week-aware schedule editing with effectiveFrom.
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  getRotationAnchor, setRotationAnchor,
  getWorkHoursHistory, getCurrentWorkHours, saveWorkHours,
  getRotationDefaultsHistory, getCurrentRotationDefaults, saveRotationDefaults,
  getWeekPlans, getWeekPlan, saveWeekPlan,
  getScheduleChangeLog, addScheduleChangeLog,
  getCustomBlocks, addCustomBlock, updateCustomBlock, deleteCustomBlock, toggleCustomBlockActive,
  addLogEntry, getRecentLogEntries,
  getEnergyEntries, getEnergyChartData, upsertEnergyEntry,
  getDailyTasksForDate, addDailyTask, updateDailyTask, deleteDailyTask,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask,
  toggleRecurringTaskActive, getRecurringTasksForDay,
  DEFAULT_WORK_HOURS, DEFAULT_ROTATION_DEFAULTS,
  getSundayOfWeek, isSecondWeekOfMonth,
  SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS,
} from '../timeguardian/storage/repository';
import { todayStr, nowTimeStr, getDayOfWeek } from '../timeguardian/logic/dayBlocks';

const TimeGuardianContext = createContext(null);

const initialState = {
  isLoading          : true,
  anchorDate         : null,
  currentWorkHours   : DEFAULT_WORK_HOURS,
  workHoursHistory   : [],
  currentRotationDefaults: DEFAULT_ROTATION_DEFAULTS,
  rotationDefaultsHistory: [],
  weekPlans          : {},
  scheduleChangeLog  : [],
  customBlocks       : [],
  recurringTasks     : [],
  logEntries         : [],
  energyEntries      : [],
  energyChartData    : [],
  todayEnergy        : null,
};

const A = {
  BOOTSTRAP       : 'BOOTSTRAP',
  SET_ANCHOR      : 'SET_ANCHOR',
  SET_WORK_HOURS  : 'SET_WORK_HOURS',
  SET_ROTATION    : 'SET_ROTATION',
  SET_WEEK_PLANS  : 'SET_WEEK_PLANS',
  SET_CHANGE_LOG  : 'SET_CHANGE_LOG',
  SET_BLOCKS      : 'SET_BLOCKS',
  SET_RECURRING   : 'SET_RECURRING',
  SET_LOGS        : 'SET_LOGS',
  SET_ENERGY      : 'SET_ENERGY',
};

function reducer(state, action) {
  switch (action.type) {
    case A.BOOTSTRAP      : return { ...state, isLoading: false, ...action.payload };
    case A.SET_ANCHOR     : return { ...state, anchorDate: action.payload };
    case A.SET_WORK_HOURS : return { ...state, currentWorkHours: action.payload.current, workHoursHistory: action.payload.history };
    case A.SET_ROTATION   : return { ...state, currentRotationDefaults: action.payload.current, rotationDefaultsHistory: action.payload.history };
    case A.SET_WEEK_PLANS : return { ...state, weekPlans: action.payload };
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
        anchor, currentWorkHours, workHoursHistory,
        currentRotationDefaults, rotationDefaultsHistory,
        weekPlans, scheduleChangeLog,
        blocks, recurringTasks, logs,
        energyEntries, energyChartData,
      ] = await Promise.all([
        getRotationAnchor(),
        getCurrentWorkHours(),
        getWorkHoursHistory(),
        getCurrentRotationDefaults(),
        getRotationDefaultsHistory(),
        getWeekPlans(),
        getScheduleChangeLog(),
        getCustomBlocks(),
        getRecurringTasks(),
        getRecentLogEntries(),
        getEnergyEntries(),
        getEnergyChartData(7),
      ]);

      const today       = todayStr();
      const todayList   = energyEntries.filter((e) => e.date === today);
      const todayEnergy = todayList.length > 0 ? todayList.sort((a,b) => a.time > b.time ? -1 : 1)[0] : null;

      dispatch({
        type: A.BOOTSTRAP,
        payload: {
          anchorDate: anchor?.anchor_date ?? null,
          currentWorkHours, workHoursHistory,
          currentRotationDefaults, rotationDefaultsHistory,
          weekPlans, scheduleChangeLog,
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
    if (reason) await addScheduleChangeLog('anchor_date', old, dateStr, reason, dateStr, false);
    dispatch({ type: A.SET_ANCHOR, payload: dateStr });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.anchorDate]);

  // ── Work Hours (versioned) ────────────────────────────────────────────────

  const updateWorkHours = useCallback(async (hours, effectiveFrom, reason) => {
    const today      = todayStr();
    const retroactive = effectiveFrom < today;
    await saveWorkHours(hours, effectiveFrom, retroactive);
    await addScheduleChangeLog('work_hours', state.currentWorkHours, hours, reason, effectiveFrom, retroactive);
    const [current, history] = await Promise.all([getCurrentWorkHours(), getWorkHoursHistory()]);
    dispatch({ type: A.SET_WORK_HOURS, payload: { current, history } });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.currentWorkHours]);

  // ── Rotation Defaults (versioned) ─────────────────────────────────────────

  const updateRotationDefaults = useCallback(async (defaults, effectiveFrom, reason) => {
    const today      = todayStr();
    const retroactive = effectiveFrom < today;
    await saveRotationDefaults(defaults, effectiveFrom, retroactive);
    await addScheduleChangeLog('rotation_defaults', state.currentRotationDefaults, defaults, reason, effectiveFrom, retroactive);
    const [current, history] = await Promise.all([getCurrentRotationDefaults(), getRotationDefaultsHistory()]);
    dispatch({ type: A.SET_ROTATION, payload: { current, history } });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.currentRotationDefaults]);

  // ── Week Plans (per-week override) ────────────────────────────────────────

  const setWeekPlan = useCallback(async (weekStartDate, plan, reason) => {
    const today      = todayStr();
    const retroactive = weekStartDate < today;
    await saveWeekPlan(weekStartDate, plan);
    await addScheduleChangeLog(
      'week_plan',
      state.weekPlans[weekStartDate] || null,
      { ...plan, weekStartDate },
      reason, weekStartDate, retroactive
    );
    dispatch({ type: A.SET_WEEK_PLANS, payload: await getWeekPlans() });
    dispatch({ type: A.SET_CHANGE_LOG, payload: await getScheduleChangeLog() });
  }, [state.weekPlans]);

  // ── Custom Blocks ─────────────────────────────────────────────────────────

  const refreshBlocks = useCallback(async () => {
    dispatch({ type: A.SET_BLOCKS, payload: await getCustomBlocks() });
  }, []);
  const createBlock = useCallback(async (b)         => { await addCustomBlock(b);             await refreshBlocks(); }, [refreshBlocks]);
  const editBlock   = useCallback(async (id, ch)    => { await updateCustomBlock(id, ch);     await refreshBlocks(); }, [refreshBlocks]);
  const removeBlock = useCallback(async (id)        => { await deleteCustomBlock(id);          await refreshBlocks(); }, [refreshBlocks]);
  const toggleBlock = useCallback(async (id)        => { await toggleCustomBlockActive(id);   await refreshBlocks(); }, [refreshBlocks]);

  // ── Daily Tasks ───────────────────────────────────────────────────────────

  const getTasksForDate = useCallback(async (date) => {
    const dow = getDayOfWeek(date);
    const [oneOff, recurring] = await Promise.all([getDailyTasksForDate(date), getRecurringTasksForDay(dow)]);
    return [...oneOff, ...recurring.map((r) => ({ ...r, isRecurring: true, date }))].sort((a,b) => a.time < b.time ? -1 : 1);
  }, []);

  const createDailyTask         = useCallback(async (t)     => addDailyTask(t), []);
  const editDailyTask           = useCallback(async (id,ch) => updateDailyTask(id, ch), []);
  const removeDailyTask         = useCallback(async (id)    => deleteDailyTask(id), []);
  const toggleDailyTaskDone     = useCallback(async (id, c) => updateDailyTask(id, { done: !c }), []);
  const toggleDailyTaskProtected= useCallback(async (id, c) => updateDailyTask(id, { protected: !c }), []);

  // ── Recurring Tasks ───────────────────────────────────────────────────────

  const refreshRecurring = useCallback(async () => {
    dispatch({ type: A.SET_RECURRING, payload: await getRecurringTasks() });
  }, []);
  const createRecurringTask = useCallback(async (t)    => { await addRecurringTask(t);              await refreshRecurring(); }, [refreshRecurring]);
  const editRecurringTask   = useCallback(async (id,ch)=> { await updateRecurringTask(id, ch);      await refreshRecurring(); }, [refreshRecurring]);
  const removeRecurringTask = useCallback(async (id)   => { await deleteRecurringTask(id);          await refreshRecurring(); }, [refreshRecurring]);
  const toggleRecurring     = useCallback(async (id)   => { await toggleRecurringTaskActive(id);   await refreshRecurring(); }, [refreshRecurring]);

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
    const todayEnergy = todayList.length > 0 ? todayList.sort((a,b) => a.time > b.time ? -1 : 1)[0] : null;
    dispatch({ type: A.SET_ENERGY, payload: { energyEntries, energyChartData, todayEnergy } });
  }, []);

  return (
    <TimeGuardianContext.Provider value={{
      ...state,
      saveAnchorDate,
      updateWorkHours, updateRotationDefaults,
      setWeekPlan,
      createBlock, editBlock, removeBlock, toggleBlock,
      getTasksForDate, createDailyTask, editDailyTask, removeDailyTask,
      toggleDailyTaskDone, toggleDailyTaskProtected,
      createRecurringTask, editRecurringTask, removeRecurringTask, toggleRecurring,
      logEntry, checkInEnergy,
      // helpers exposed for UI
      isSecondWeekOfMonth, getSundayOfWeek,
      SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS,
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
