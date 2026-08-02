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
  addLogEntry, getRecentLogEntries, updateLogEntry, deleteLogEntry,
  getEnergyEntries, getEnergyChartData, getEnergyEntriesForDate, upsertEnergyEntry,
  getDailySummaries, upsertDailySummary, getDailySummaryChartData,
  getDailyTasksForDate, addDailyTask, updateDailyTask, deleteDailyTask,
  getRecurringTasks, addRecurringTask, updateRecurringTask, deleteRecurringTask,
  toggleRecurringTaskActive, getRecurringTasksForDay,
  getDayOverrides, getDayOverride, saveDayOverride as repoSaveDayOverride, clearDayOverride as repoClearDayOverride,
  DEFAULT_WORK_HOURS, DEFAULT_ROTATION_DEFAULTS,
  getMondayOfWeek, isSecondWeekOfMonth,
  SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS, DAY_OVERRIDE_TYPES,
  getSessionForTime,
} from '../timeguardian/storage/repository';
import { todayStr, nowTimeStr, getDayOfWeek } from '../timeguardian/logic/dayBlocks';

const TimeGuardianContext = createContext(null);

const initialState = {
  isLoading               : true,
  anchorDate              : null,
  currentWorkHours        : DEFAULT_WORK_HOURS,
  workHoursHistory        : [],
  currentRotationDefaults : DEFAULT_ROTATION_DEFAULTS,
  rotationDefaultsHistory : [],
  weekPlans               : {},
  scheduleChangeLog       : [],
  customBlocks            : [],
  recurringTasks          : [],
  logEntries              : [],
  energyEntries           : [],
  energyChartData         : [],
  todayEnergy             : null,
  todaySessionEntries     : [],   // all energy entries for today, one per session
  dailySummaries          : {},   // keyed by date — combined weighted score per day
  dayOverrides            : {},
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
  SET_DAY_OVERRIDES: 'SET_DAY_OVERRIDES',
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
    case A.SET_ENERGY        : return { ...state, ...action.payload };
    case A.SET_DAY_OVERRIDES : return { ...state, dayOverrides: action.payload };
    default                  : return state;
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
        dailySummaries, dayOverrides,
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
        getDailySummaries(),
        getDayOverrides(),
      ]);

      const today               = todayStr();
      const todayList           = energyEntries.filter((e) => e.date === today);
      const todayEnergy         = todayList.length > 0 ? todayList.sort((a,b) => a.time > b.time ? -1 : 1)[0] : null;
      const todaySessionEntries = todayList;

      dispatch({
        type: A.BOOTSTRAP,
        payload: {
          anchorDate: anchor?.anchor_date ?? null,
          currentWorkHours, workHoursHistory,
          currentRotationDefaults, rotationDefaultsHistory,
          weekPlans, scheduleChangeLog,
          customBlocks: blocks, recurringTasks,
          logEntries: logs, energyEntries, energyChartData, todayEnergy,
          todaySessionEntries, dailySummaries,
          dayOverrides,
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

  // ── Day Overrides (per-date, independent of week plan) ───────────────────

  const refreshDayOverrides = useCallback(async () => {
    dispatch({ type: A.SET_DAY_OVERRIDES, payload: await getDayOverrides() });
  }, []);

  const setDayOverride = useCallback(async (dateStr, type, note = '') => {
    await repoSaveDayOverride(dateStr, type, note);
    await refreshDayOverrides();
  }, [refreshDayOverrides]);

  const removeDayOverride = useCallback(async (dateStr) => {
    await repoClearDayOverride(dateStr);
    await refreshDayOverrides();
  }, [refreshDayOverrides]);

  // ── Log ───────────────────────────────────────────────────────────────────

  const refreshLogs = useCallback(async () => {
    dispatch({ type: A.SET_LOGS, payload: await getRecentLogEntries() });
  }, []);

  const logEntry = useCallback(async (entry) => {
    const saved = await addLogEntry(entry);
    await refreshLogs();
    return saved;
  }, [refreshLogs]);

  const editLogEntry = useCallback(async (id, changes) => {
    await updateLogEntry(id, changes);
    await refreshLogs();
  }, [refreshLogs]);

  const removeLogEntry = useCallback(async (id) => {
    await deleteLogEntry(id);
    await refreshLogs();
  }, [refreshLogs]);

  // ── Energy ────────────────────────────────────────────────────────────────

  const checkInEnergy = useCallback(async (level, cause = null, session = null) => {
    const today     = todayStr();
    const time      = nowTimeStr();
    const workHours = state.currentWorkHours;
    await upsertEnergyEntry(today, time, level, cause, session, workHours);
    await upsertDailySummary(today);
    const [energyEntries, energyChartData, dailySummaries] = await Promise.all([
      getEnergyEntries(),
      getEnergyChartData(7),
      getDailySummaries(),
    ]);
    const todayList           = energyEntries.filter((e) => e.date === today);
    const todayEnergy         = todayList.length > 0 ? todayList.sort((a, b) => a.time > b.time ? -1 : 1)[0] : null;
    const todaySessionEntries = todayList;
    dispatch({ type: A.SET_ENERGY, payload: { energyEntries, energyChartData, todayEnergy, todaySessionEntries, dailySummaries } });
  }, [state.currentWorkHours]);

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
      logEntry, editLogEntry, removeLogEntry, checkInEnergy,
      setDayOverride, removeDayOverride,
      getDailySummaryChartData,
      // helpers exposed for UI
      isSecondWeekOfMonth, getMondayOfWeek,
      SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS, DAY_OVERRIDE_TYPES,
      getSessionForTime,
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
