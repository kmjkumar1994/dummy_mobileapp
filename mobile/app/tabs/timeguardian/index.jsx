/**
 * index.jsx — v5
 * Week starts Sunday, expandable bottom action bar,
 * day cards tappable, week plan editor per week.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, ScrollView, TouchableOpacity, Pressable, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, Platform, Animated,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import {
  todayStr, nowTimeStr, getWeekDatesForOffset, weekRangeLabel, toDisplayDate, getDayOfWeek,
} from '../../../timeguardian/logic/dayBlocks';
import { getBlocksForDate } from '../../../timeguardian/logic/dayBlocks';
import {
  findConflict, DURATION_PRESETS, WHOLE_DAY_START, WHOLE_DAY_END, computeEndTime,
} from '../../../timeguardian/logic/conflict';
import {
  TGColors, TGCategoryColors, TGEnergyColors, TGEnergyLabels, TGSessionColors, DAY_LABELS_FULL,
} from '../../../timeguardian/theme/tokens';
import {
  SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS,
  isSecondWeekOfMonth, getMondayOfWeek,
  SESSION_KEYS, SESSION_LABELS, SESSION_ICONS, getSessionForTime, getSessionBounds,
} from '../../../timeguardian/storage/repository';

// ─── Anchor Prompt ────────────────────────────────────────────────────────────

function AnchorPrompt({ onSave }) {
  const [date, setDate] = useState('');
  const [show, setShow] = useState(false);

  const handleSave = () => {
    if (!date) { Alert.alert('Pick a Sunday'); return; }
    if (new Date(date + 'T00:00:00').getDay() !== 0) { Alert.alert('Not a Sunday', 'Must be a Sunday.'); return; }
    onSave(date);
  };

  return (
    <View style={styles.anchorWrap}>
      <Text style={styles.anchorTitle}>Welcome to Time Guardian</Text>
      <Text style={styles.anchorBody}>
        Pick a Sunday when you visited your mother's home. This anchors your week-of-month calculation.
      </Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setShow(true)}>
        <Text style={styles.pickerBtnText}>{date ? toDisplayDate(date) : 'Pick a Sunday'}</Text>
        <Text>📅</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={date ? (() => { const [y,m,d] = date.split('-').map(Number); return new Date(y,m-1,d); })() : new Date()}
          mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, sel) => {
            setShow(false);
            if (sel) {
              const y = sel.getFullYear(), m = String(sel.getMonth()+1).padStart(2,'0'), d = String(sel.getDate()).padStart(2,'0');
              setDate(`${y}-${m}-${d}`);
            }
          }} />
      )}
      <TouchableOpacity style={[styles.goldBtn, { marginTop: 20 }]} onPress={handleSave}>
        <Text style={styles.goldBtnText}>Set anchor & begin</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Session Energy Card ──────────────────────────────────────────────────────

const CAUSES = ['Work', 'Family', 'Karmayoga', 'Health', 'Other'];

// Weights for overall day score — evening matters most, morning least
const SESSION_WEIGHTS = { morning: 1, work_am: 1.5, work_pm: 1.5, evening: 2 };

/**
 * Compute a weighted day score from all sessions that have entries.
 * Returns null if no entries yet, 1-5 otherwise.
 */
function computeDayScore(entryBySession) {
  let weightedSum = 0;
  let totalWeight = 0;
  SESSION_KEYS.forEach((s) => {
    const e = entryBySession[s];
    if (e) {
      const w = SESSION_WEIGHTS[s];
      weightedSum += e.level * w;
      totalWeight += w;
    }
  });
  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10; // one decimal
}

/** Overall label based on score */
function dayScoreLabel(score) {
  if (score === null) return null;
  if (score >= 4.5) return 'Excellent day';
  if (score >= 3.5) return 'Good day';
  if (score >= 2.5) return 'Steady day';
  if (score >= 1.5) return 'Tough day';
  return 'Draining day';
}

/** How many sessions contributed to the score */
function scoreBreakdown(entryBySession) {
  return SESSION_KEYS
    .filter((s) => entryBySession[s])
    .map((s) => `${SESSION_ICONS[s]} ${entryBySession[s].level}`)
    .join('  ');
}

function SessionEnergyCard({ todayEntries, currentWorkHours, onCheckIn }) {
  const [activeSession,  setActiveSession]  = useState(null);
  const [pendingLevel,   setPendingLevel]   = useState(null);
  const [pendingSession, setPendingSession] = useState(null);
  const [expanded,       setExpanded]       = useState(false);

  const nowSession = useMemo(() => {
    const now = new Date();
    const t   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return getSessionForTime(t, currentWorkHours);
  }, [currentWorkHours]);

  const entryBySession = useMemo(() => {
    const map = {};
    (todayEntries || []).forEach((e) => {
      const s = e.session || getSessionForTime(e.time, currentWorkHours);
      if (!map[s] || e.time > map[s].time) map[s] = { ...e, session: s };
    });
    return map;
  }, [todayEntries, currentWorkHours]);

  const dayScore   = useMemo(() => computeDayScore(entryBySession), [entryBySession]);
  const entryCount = Object.keys(entryBySession).length;
  const scoreColor = dayScore !== null ? TGEnergyColors[Math.round(dayScore)] : TGColors.faint;

  const handleLevelTap = (session, level) => {
    if (level >= 3) {
      onCheckIn(level, null, session);
      setActiveSession(null); setPendingLevel(null); setPendingSession(null);
    } else {
      setPendingLevel(level); setPendingSession(session);
    }
  };

  const handleCause = (cause) => {
    onCheckIn(pendingLevel, cause, pendingSession);
    setActiveSession(null); setPendingLevel(null); setPendingSession(null);
  };

  return (
    <View style={styles.sessionCard}>
      {/* ── Day overall summary — tap to expand/collapse ── */}
      <TouchableOpacity style={styles.sessionDaySummary} onPress={() => setExpanded(v => !v)} activeOpacity={0.75}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessionCardTitle}>How's your day going?</Text>
          {dayScore !== null && (
            <Text style={[styles.sessionDayLabel, { color: scoreColor }]}>
              {dayScoreLabel(dayScore)}
            </Text>
          )}
        </View>
        {dayScore !== null ? (
          <View style={[styles.sessionDayScoreBadge, { borderColor: scoreColor }]}>
            <Text style={[styles.sessionDayScoreNum, { color: scoreColor }]}>
              {dayScore.toFixed(1)}
            </Text>
            <Text style={styles.sessionDayScoreDenom}>/5</Text>
          </View>
        ) : (
          <Text style={styles.sessionDayScoreEmpty}>
            {entryCount === 0 ? 'No check-ins yet' : `${entryCount}/4 sessions`}
          </Text>
        )}
        <Text style={styles.sessionCardChevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && <View>
      {/* Session progress dots */}
      <View style={styles.sessionDotsRow}>
        {SESSION_KEYS.map((s) => {
          const e = entryBySession[s];
          const c = TGSessionColors[s];
          return (
            <View key={s} style={styles.sessionDotItem}>
              <View style={[
                styles.sessionDot,
                e ? { backgroundColor: TGEnergyColors[e.level] } : { backgroundColor: TGColors.line },
                s === nowSession && !e && { borderColor: c, borderWidth: 1.5 },
              ]} />
              <Text style={[styles.sessionDotLabel, e && { color: TGEnergyColors[e.level] }]}>
                {SESSION_ICONS[s]}
              </Text>
            </View>
          );
        })}
        <View style={styles.sessionDotFill} />
        {entryCount > 0 && entryCount < 4 && (
          <Text style={styles.sessionDotStatus}>{entryCount}/4</Text>
        )}
        {entryCount === 4 && (
          <Text style={[styles.sessionDotStatus, { color: TGColors.sage }]}>Complete ✓</Text>
        )}
      </View>

      {/* ── Session rows ── */}
      {SESSION_KEYS.map((sKey) => {
        const entry      = entryBySession[sKey];
        const bounds     = getSessionBounds(sKey, currentWorkHours);
        const isNow      = sKey === nowSession;
        const isOpen     = activeSession === sKey;
        const color      = TGSessionColors[sKey];
        const isPending  = pendingSession === sKey;

        return (
          <View key={sKey} style={[styles.sessionRow, isNow && styles.sessionRowActive]}>
            <View style={styles.sessionMeta}>
              <View style={styles.sessionNameRow}>
                <Text style={styles.sessionIcon}>{SESSION_ICONS[sKey]}</Text>
                <View>
                  <Text style={[styles.sessionName, isNow && { color }]}>
                    {SESSION_LABELS[sKey]}
                    {isNow ? <Text style={styles.sessionNowTag}>  · now</Text> : null}
                  </Text>
                  <Text style={styles.sessionTime}>{bounds.start} – {bounds.end}</Text>
                </View>
              </View>
              {entry && !isOpen && (
                <View style={styles.sessionLastEntry}>
                  <Text style={[styles.sessionLastLevel, { color: TGEnergyColors[entry.level] }]}>
                    {TGEnergyLabels[entry.level]}
                  </Text>
                  {entry.cause
                    ? <Text style={styles.sessionLastCause}>· {entry.cause}</Text>
                    : null}
                  <Text style={styles.sessionLastTime}>{entry.time}</Text>
                </View>
              )}
            </View>

            {isOpen ? (
              <View style={styles.sessionInputArea}>
                {isPending ? (
                  <View>
                    <Text style={styles.sessionCauseLabel}>What's causing this?</Text>
                    <View style={styles.sessionCauseRow}>
                      {CAUSES.map((c) => (
                        <TouchableOpacity key={c}
                          style={[styles.sessionCauseChip, { borderColor: color }]}
                          onPress={() => handleCause(c)}>
                          <Text style={[styles.sessionCauseChipText, { color }]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.sessionLevelRow}>
                    {[1,2,3,4,5].map((l) => {
                      const isSelected = entry && entry.level === l;
                      return (
                        <TouchableOpacity key={l}
                          style={[
                            styles.sessionLevelBtn,
                            { borderColor: TGEnergyColors[l] },
                            isSelected && { backgroundColor: TGEnergyColors[l] },
                          ]}
                          onPress={() => handleLevelTap(sKey, l)}>
                          <Text style={[
                            styles.sessionLevelText,
                            { color: isSelected ? TGColors.background : TGEnergyColors[l] },
                            isSelected && { fontWeight: '800' },
                          ]}>
                            {TGEnergyLabels[l]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <TouchableOpacity
                  style={styles.sessionCancelBtn}
                  onPress={() => { setActiveSession(null); setPendingLevel(null); setPendingSession(null); }}>
                  <Text style={styles.sessionCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.sessionCheckBtn,
                  entry && { borderColor: TGEnergyColors[entry.level] },
                  isNow && !entry && { borderColor: color },
                ]}
                onPress={() => { setActiveSession(sKey); setPendingLevel(null); setPendingSession(null); }}>
                <Text style={[
                  styles.sessionCheckBtnText,
                  entry && { color: TGEnergyColors[entry.level], fontWeight: '700' },
                  isNow && !entry && { color },
                ]}>
                  {entry
                    ? `${entry.level}/5  ${TGEnergyLabels[entry.level]}`
                    : isNow ? 'Check in' : 'Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      </View>}
    </View>
  );
}

// ─── Block Row ────────────────────────────────────────────────────────────────

function BlockRow({ block, onPress }) {
  const color = TGCategoryColors[block.category] || TGColors.muted;
  return (
    <TouchableOpacity style={styles.blockRow} onPress={() => onPress(block)} activeOpacity={0.7}>
      <View style={[styles.blockBar, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.blockLabel}>{block.label}</Text>
        <Text style={styles.blockTime}>{block.start} – {block.end}</Text>
      </View>
      {block.type === 'soft' && <View style={styles.softTag}><Text style={styles.softTagText}>soft</Text></View>}
      <Text style={styles.blockChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Day Section ─────────────────────────────────────────────────────────────

function DaySection({ dateStr, customBlocks, onBlockPress, onDayPress, weekPlan }) {
  const [blocks, setBlocks] = useState([]);
  const today   = todayStr();
  const isToday = dateStr === today;

  useEffect(() => {
    getBlocksForDate(dateStr, customBlocks).then((b) => setBlocks(b));
  }, [dateStr, customBlocks, weekPlan]);

  const visible = blocks.filter((b) => b.category !== 'sleep');
  const { year, month, day } = { year: +dateStr.split('-')[0], month: +dateStr.split('-')[1], day: +dateStr.split('-')[2] };
  const d = new Date(year, month - 1, day);

  return (
    <View style={[styles.dayCard, isToday && styles.dayCardToday]}>
      {/* Day header — tapping the name/date navigates to day detail */}
      <Pressable onPress={onDayPress} android_ripple={{ color: TGColors.line }}>
        <View style={styles.dayHeader}>
          <Text style={[styles.dayName, isToday && { color: TGColors.gold }]}>
            {DAY_LABELS_FULL[d.getDay()]}
            {isToday ? <Text style={styles.todayTag}>  Today</Text> : null}
          </Text>
          <Text style={styles.dayDate}>
            {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
        </View>
      </Pressable>
      {/* Block rows — each has its own press for block detail sheet */}
      {visible.length === 0
        ? <Text style={styles.openText}>open — nothing claimed yet</Text>
        : visible.map((b, i) => <BlockRow key={i} block={b} onPress={onBlockPress} />)}
      {/* Tap hint navigates to day detail */}
      <Pressable onPress={onDayPress}>
        <Text style={styles.dayTapHint}>Tap to view & add tasks →</Text>
      </Pressable>
    </View>
  );
}

// ─── Week Plan Editor ─────────────────────────────────────────────────────────

function WeekPlanModal({ visible, weekStartDate, currentPlan, isSatoriWeek, onSave, onClose }) {
  const sundayOptions   = Object.entries(SUNDAY_TYPE_LABELS);
  const saturdayOptions = Object.entries(SATURDAY_TYPE_LABELS);

  // Form state
  const [sundayType,          setSundayType]          = useState('open');
  const [sundayCustomLabel,   setSundayCustomLabel]   = useState('');
  const [saturdayType,        setSaturdayType]        = useState('open');
  const [saturdayCustomLabel, setSaturdayCustomLabel] = useState('');
  const [reason,              setReason]              = useState('');

  // Edit-gate: null | 'sun' | 'sat'
  // null = no gate open; 'sun'/'sat' = reason prompt shown for that day
  const [editGate,     setEditGate]     = useState(null);
  const [editGateReason, setEditGateReason] = useState('');

  // Which custom fields have been unlocked this session
  const [sunUnlocked, setSunUnlocked] = useState(false);
  const [satUnlocked, setSatUnlocked] = useState(false);

  // Collected edit reasons to append to the main reason log
  const [editReasonLog, setEditReasonLog] = useState([]);

  const today  = todayStr();
  const isPast = weekStartDate < today;

  // A saved custom label means currentPlan already has this type+label from a previous save
  const savedSunCustom = currentPlan?.sundayType   === 'custom' ? (currentPlan?.sundayCustomLabel || '') : '';
  const savedSatCustom = currentPlan?.saturdayType === 'custom' ? (currentPlan?.saturdayCustomLabel || '') : '';

  useEffect(() => {
    if (visible) {
      setSundayType(currentPlan?.sundayType          || 'open');
      setSundayCustomLabel(currentPlan?.sundayCustomLabel   || '');
      setSaturdayType(currentPlan?.saturdayType        || 'open');
      setSaturdayCustomLabel(currentPlan?.saturdayCustomLabel || '');
      setReason(currentPlan?.reason || '');   // pre-fill last saved reason
      setEditGate(null);
      setEditGateReason('');
      setSunUnlocked(false);
      setSatUnlocked(false);
      setEditReasonLog([]);
    }
  }, [visible, currentPlan]);

  // Confirm the edit-gate reason and unlock that day's custom input
  const confirmEditGate = () => {
    if (!editGateReason.trim()) {
      Alert.alert('Reason required', 'Please explain why you need to edit this custom label.');
      return;
    }
    const dayLabel = editGate === 'sun' ? 'Sunday' : 'Saturday';
    setEditReasonLog((prev) => [...prev, `${dayLabel} custom edit: ${editGateReason.trim()}`]);
    if (editGate === 'sun') { setSunUnlocked(true); }
    else                    { setSatUnlocked(true); }
    setEditGate(null);
    setEditGateReason('');
  };

  const handleSave = () => {
    if (!reason.trim()) {
      Alert.alert('Reason required', 'Please explain why this week is being changed.');
      return;
    }
    if (sundayType === 'custom' && !sundayCustomLabel.trim()) {
      Alert.alert('Label required', 'Enter a label for the custom Sunday commitment.');
      return;
    }
    if (saturdayType === 'custom' && !saturdayCustomLabel.trim()) {
      Alert.alert('Label required', 'Enter a label for the custom Saturday commitment.');
      return;
    }
    // Build full reason including any edit-gate reasons
    const fullReason = editReasonLog.length > 0
      ? `${reason.trim()} [${editReasonLog.join(' | ')}]`
      : reason.trim();

    onSave(weekStartDate, {
      sundayType,
      sundayCustomLabel   : sundayType   === 'custom' ? sundayCustomLabel.trim()   : '',
      saturdayType,
      saturdayCustomLabel : saturdayType === 'custom' ? saturdayCustomLabel.trim() : '',
      reason              : fullReason,  // persisted in the plan so it shows on reopen
    }, fullReason);
    onClose();
  };

  if (isSatoriWeek) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Week of {toDisplayDate(weekStartDate)}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.modalScroll}>
            <View style={styles.satoriBadge}>
              <Text style={styles.satoriBadgeText}>🌿 Second week of month — Satori</Text>
              <Text style={styles.satoriBadgeSub}>Saturday and Sunday are automatically protected as Satori — rest and recharge. This cannot be overridden.</Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Custom label field helper ──────────────────────────────────────────────
  // day: 'sun' | 'sat'
  const renderCustomField = (day) => {
    const isSun       = day === 'sun';
    const savedLabel  = isSun ? savedSunCustom : savedSatCustom;
    const curLabel    = isSun ? sundayCustomLabel : saturdayCustomLabel;
    const setLabel    = isSun ? setSundayCustomLabel : setSaturdayCustomLabel;
    const unlocked    = isSun ? sunUnlocked : satUnlocked;
    const placeholder = isSun
      ? 'Describe this Sunday commitment…'
      : 'Describe this Saturday commitment…';

    // First time entering custom (no saved label yet) → just show the input
    if (!savedLabel) {
      return (
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder={placeholder}
          placeholderTextColor={TGColors.muted}
          value={curLabel}
          onChangeText={setLabel}
          autoFocus
        />
      );
    }

    // Saved label exists and not yet unlocked → read-only card + Edit button
    if (!unlocked) {
      return (
        <>
          <View style={styles.customReadonlyCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customReadonlyMeta}>Custom commitment</Text>
              <Text style={styles.customReadonlyValue}>{curLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.customEditBtn}
              onPress={() => { setEditGate(day); setEditGateReason(''); }}
            >
              <Text style={styles.customEditBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Edit-gate reason prompt — inline, shown when this day's gate is open */}
          {editGate === day && (
            <View style={styles.editReasonCard}>
              <Text style={styles.editReasonTitle}>Why do you need to edit this?</Text>
              <Text style={styles.editReasonSub}>This will be recorded in the schedule change log.</Text>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="e.g. Typed incorrectly, commitment changed…"
                placeholderTextColor={TGColors.muted}
                value={editGateReason}
                onChangeText={setEditGateReason}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.goldBtn, { marginTop: 8, backgroundColor: TGColors.clay }]}
                onPress={confirmEditGate}
              >
                <Text style={styles.goldBtnText}>Proceed to edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => { setEditGate(null); setEditGateReason(''); }}
              >
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      );
    }

    // Unlocked → editable input with original value pre-filled
    return (
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder={placeholder}
        placeholderTextColor={TGColors.muted}
        value={curLabel}
        onChangeText={setLabel}
        autoFocus
      />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Plan week of {toDisplayDate(weekStartDate)}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          {isPast && (
            <View style={styles.pastWarning}>
              <Text style={styles.pastWarningText}>⚠ This is a past week. Changes are retroactive and will be logged.</Text>
            </View>
          )}

          {/* ── Sunday ── */}
          <Text style={styles.fieldLabel}>Sunday commitment</Text>
          <View style={styles.chipCol}>
            {sundayOptions.map(([key, label]) => (
              <TouchableOpacity key={key}
                style={[styles.optionBtn, sundayType === key && styles.optionBtnActive]}
                onPress={() => {
                  setSundayType(key);
                  if (key !== 'custom') { setSunUnlocked(false); setEditGate(null); }
                }}>
                <Text style={[styles.optionBtnText, sundayType === key && styles.optionBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {sundayType === 'custom' && renderCustomField('sun')}

          {/* ── Saturday ── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Saturday commitment</Text>
          <View style={styles.chipCol}>
            {saturdayOptions.map(([key, label]) => (
              <TouchableOpacity key={key}
                style={[styles.optionBtn, saturdayType === key && styles.optionBtnActive]}
                onPress={() => {
                  setSaturdayType(key);
                  if (key !== 'custom') { setSatUnlocked(false); setEditGate(null); }
                }}>
                <Text style={[styles.optionBtnText, saturdayType === key && styles.optionBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {saturdayType === 'custom' && renderCustomField('sat')}

          {/* ── Main reason ── */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
            Why is this week different?{isPast ? ' (retroactive — required)' : ''}
          </Text>
          <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            placeholder="e.g. Wife's schedule changed this week"
            placeholderTextColor={TGColors.muted}
            value={reason} onChangeText={setReason} multiline />

          <TouchableOpacity style={[styles.goldBtn, { marginTop: 16 }]} onPress={handleSave}>
            <Text style={styles.goldBtnText}>Save week plan</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Block Detail Sheet ───────────────────────────────────────────────────────

function BlockDetailSheet({ block, onClose }) {
  if (!block) return null;
  const color = TGCategoryColors[block.category] || TGColors.muted;
  const hint = block.category === 'work' ? 'Settings → Work Hours'
    : block.category === 'sleep' ? null
    : ['family','self','karmayoga'].includes(block.category) ? 'Settings → Rotation or tap week header to plan this week'
    : 'Settings → Your Blocks';

  return (
    <Modal visible={!!block} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Block detail</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <View style={styles.modalScroll}>
          <View style={[styles.detailBar, { backgroundColor: color }]} />
          <Text style={styles.detailLabel}>{block.label}</Text>
          <Text style={styles.detailTime}>{block.start} – {block.end}</Text>
          <View style={styles.detailRow}><Text style={styles.detailMeta}>Category</Text><Text style={[styles.detailValue, { color }]}>{block.category}</Text></View>
          <View style={styles.detailRow}><Text style={styles.detailMeta}>Type</Text><Text style={styles.detailValue}>{block.type === 'protected' ? '🔒 Protected' : '〜 Soft'}</Text></View>
          {hint
            ? <View style={styles.detailHint}><Text style={styles.detailHintText}>To change → {hint}</Text></View>
            : <View style={styles.detailHint}><Text style={styles.detailHintText}>Sleep blocks are fixed and cannot be edited.</Text></View>}
        </View>
      </View>
    </Modal>
  );
}

// ─── Date & Time Pickers for Check Request ────────────────────────────────────

function DatePickerField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  const dateObj = value ? (() => { const [y,m,d] = value.split('-').map(Number); return new Date(y,m-1,d); })() : new Date();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setShow(true)}>
        <Text style={styles.pickerBtnText}>{value ? toDisplayDate(value) : 'DD-MM-YYYY'}</Text>
        <Text>📅</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker value={dateObj} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, sel) => {
            setShow(false);
            if (sel) { const y=sel.getFullYear(),m=String(sel.getMonth()+1).padStart(2,'0'),d=String(sel.getDate()).padStart(2,'0'); onChange(`${y}-${m}-${d}`); }
          }} />
      )}
    </View>
  );
}

function TimePickerField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  const timeObj = (() => { const d = new Date(); if (value) { const [h,m] = value.split(':').map(Number); d.setHours(h,m,0,0); } return d; })();
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setShow(true)}>
        <Text style={styles.pickerBtnText}>{value || 'HH:MM'}</Text>
        <Text>🕐</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker value={timeObj} mode="time" is24Hour display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, sel) => {
            setShow(false);
            if (sel) onChange(`${String(sel.getHours()).padStart(2,'0')}:${String(sel.getMinutes()).padStart(2,'0')}`);
          }} />
      )}
    </View>
  );
}

// ─── Conflict Block Card (reusable) ──────────────────────────────────────────

function ConflictBlockCard({ block, color }) {
  return (
    <View style={[styles.conflictCard, { borderLeftColor: color }]}>
      <Text style={styles.conflictLabel}>{block.label}</Text>
      <Text style={styles.conflictTime}>{block.start} – {block.end}</Text>
      <View style={styles.conflictMeta}>
        <View style={[styles.conflictCategoryPill, { backgroundColor: color + '22', borderColor: color }]}>
          <Text style={[styles.conflictCategoryText, { color }]}>{block.category}</Text>
        </View>
        <View style={styles.conflictTypePill}>
          <Text style={styles.conflictTypeText}>
            {block.type === 'protected' ? '🔒 protected' : '〜 soft'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Check Request Modal ──────────────────────────────────────────────────────

function CheckRequestModal({ visible, onClose, anchorDate, customBlocks, workHours, rotationSchedule, onLog, getTasksForDate }) {
  const [label,       setLabel]       = useState('');
  const [date,        setDate]        = useState(todayStr());
  const [start,       setStart]       = useState('');
  const [duration,    setDuration]    = useState('1h');
  const [result,      setResult]      = useState(null);
  const [movedTo,     setMovedTo]     = useState('');
  const [checking,    setChecking]    = useState(false);
  const [showAllConflicts, setShowAllConflicts] = useState(false);
  const durations = Object.keys(DURATION_PRESETS);

  const reset = () => {
    setLabel(''); setDate(todayStr()); setStart(''); setDuration('1h');
    setResult(null); setMovedTo(''); setChecking(false); setShowAllConflicts(false);
  };

  const handleCheck = async () => {
    if (!label.trim() || !date || !start) { Alert.alert('Missing fields', 'Please fill in what\'s being asked, the date, and a start time.'); return; }
    setChecking(true);
    setShowAllConflicts(false);
    try {
      const reqStart   = duration === 'whole day' ? WHOLE_DAY_START : start;
      const reqEnd     = duration === 'whole day' ? WHOLE_DAY_END   : computeEndTime(start, DURATION_PRESETS[duration]);
      const dailyTasks = getTasksForDate ? await getTasksForDate(date) : [];
      const conflict   = await findConflict(
        date, reqStart, reqEnd,
        anchorDate, customBlocks,
        workHours, rotationSchedule,
        dailyTasks
      );
      setResult({ ...conflict, reqStart, reqEnd });
    } catch (e) {
      Alert.alert('Error', 'Could not check this slot. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleLog = async (outcome) => {
    await onLog({ date, start: result.reqStart, end: result.reqEnd, requestLabel: label, outcome, displaced: result.block?.label ?? null, movedTo: movedTo || null });
    reset(); onClose();
  };

  const isSleep        = result?.block?.category === 'sleep';
  const conflictColor  = result?.block ? (TGCategoryColors[result.block.category] || TGColors.clay) : TGColors.clay;
  // Other conflicts = all except the primary "best" block shown at top
  const otherConflicts = result?.allConflicts?.filter((b) => b !== result.block) ?? [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Someone's asking for my time</Text>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          {result === null ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>What's being asked?</Text>
                <TextInput style={styles.input} placeholderTextColor={TGColors.muted} placeholder="e.g. Team lunch, client call…" value={label} onChangeText={setLabel} />
              </View>
              <DatePickerField label="Date" value={date} onChange={setDate} />
              <TimePickerField label="Start time" value={start} onChange={setStart} />
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Duration</Text>
                <View style={styles.chipRow}>
                  {durations.map((d) => (
                    <TouchableOpacity key={d} style={[styles.chip, duration === d && styles.chipActive]} onPress={() => setDuration(d)}>
                      <Text style={[styles.chipText, duration === d && styles.chipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity style={[styles.goldBtn, checking && { opacity: 0.6 }]} onPress={handleCheck} disabled={checking}>
                {checking
                  ? <ActivityIndicator color={TGColors.background} />
                  : <Text style={styles.goldBtnText}>Check this slot</Text>}
              </TouchableOpacity>
            </>
          ) : result.block === null ? (
            <View>
              <Text style={[styles.resultTitle, { color: TGColors.sage }]}>✓  This slot is open</Text>
              <Text style={styles.resultSub}>
                {label} on {toDisplayDate(date)} at {result.reqStart}–{result.reqEnd} has no conflicts.
              </Text>
              <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.sage }]} onPress={() => handleLog('open')}>
                <Text style={styles.goldBtnText}>Log it as booked</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setResult(null)}>
                <Text style={styles.ghostBtnText}>← Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={[styles.resultTitle, { color: isSleep ? TGColors.night : TGColors.clay }]}>
                {isSleep ? '😴  This eats into sleep' : '⚡  Conflict found'}
              </Text>
              <Text style={styles.resultSub}>
                {label} at {result.reqStart}–{result.reqEnd} overlaps:
              </Text>

              {/* Primary conflict block */}
              <ConflictBlockCard block={result.block} color={conflictColor} />

              {/* Other conflicts — expandable */}
              {otherConflicts.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.showAllBtn}
                    onPress={() => setShowAllConflicts((v) => !v)}
                  >
                    <Text style={styles.showAllBtnText}>
                      {showAllConflicts
                        ? `▲  Hide other conflict${otherConflicts.length > 1 ? 's' : ''}`
                        : `▼  Show ${otherConflicts.length} more conflict${otherConflicts.length > 1 ? 's' : ''}`}
                    </Text>
                  </TouchableOpacity>
                  {showAllConflicts && otherConflicts.map((b, i) => {
                    const c = TGCategoryColors[b.category] || TGColors.muted;
                    return <ConflictBlockCard key={i} block={b} color={c} />;
                  })}
                </>
              )}

              <Text style={styles.conflictWarning}>
                Saying yes means these commitments get moved, shortened, or dropped.
              </Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Where does it move to? (optional)</Text>
                <TextInput style={styles.input} placeholderTextColor={TGColors.muted} placeholder="e.g. tomorrow morning" value={movedTo} onChangeText={setMovedTo} />
              </View>
              <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.sage }]} onPress={() => handleLog('protected')}>
                <Text style={styles.goldBtnText}>Protect it — decline the ask</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.clay }]} onPress={() => handleLog('yielded')}>
                <Text style={styles.goldBtnText}>Yield this time</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setResult(null)}>
                <Text style={styles.ghostBtnText}>← Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Exception Modal ──────────────────────────────────────────────────────────

function ExceptionModal({ visible, onClose, onLog }) {
  const [category, setCategory] = useState(null);
  const [note,     setNote]     = useState('');
  const [date,     setDate]     = useState(todayStr());
  const [useTime,  setUseTime]  = useState(false);
  const [start,    setStart]    = useState('');
  const [end,      setEnd]      = useState('');
  const [saved,    setSaved]    = useState(null);
  const cats = ['rest', 'health', 'emergency', 'other'];

  const reset = () => {
    setCategory(null); setNote(''); setDate(todayStr());
    setUseTime(false); setStart(''); setEnd(''); setSaved(null);
  };

  const handleSave = async () => {
    if (!category) { Alert.alert('Select a category'); return; }
    const entry = {
      date,
      start       : useTime && start ? start : nowTimeStr(),
      end         : useTime && end   ? end   : nowTimeStr(),
      requestLabel: `Exception — ${category}`,
      outcome     : 'exception',
      category,
      note        : note || null,
    };
    await onLog(entry);
    setSaved({ ...entry, category });
  };

  const catLabel = (c) =>
    c === 'rest' ? 'Rest / burnout' : c.charAt(0).toUpperCase() + c.slice(1);

  // ── Confirmation view ──────────────────────────────────────────────────────
  if (saved) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Exception saved</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <View style={[styles.modalScroll, { alignItems: 'flex-start' }]}>
            <View style={styles.exceptionConfirmCard}>
              <Text style={styles.exceptionConfirmIcon}>🌿</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.exceptionConfirmTitle}>{catLabel(saved.category)}</Text>
                <Text style={styles.exceptionConfirmDate}>
                  {toDisplayDate(saved.date)}
                  {useTime && saved.start ? `  ·  ${saved.start}${saved.end && saved.end !== saved.start ? ` – ${saved.end}` : ''}` : ''}
                </Text>
                {saved.note ? <Text style={styles.exceptionConfirmNote}>{saved.note}</Text> : null}
                <Text style={styles.exceptionConfirmSub}>
                  This exception is logged. It will never be counted against you.
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.goldBtn, { width: '100%' }]} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.goldBtnText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={reset}>
              <Text style={styles.ghostBtnText}>Log another exception</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Entry view ─────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Need an exception</Text>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <Text style={styles.exceptionNote}>
            Exceptions are never counted against you — they're your body or life requiring care.
          </Text>
          <Text style={styles.fieldLabel}>What kind of exception?</Text>
          <View style={[styles.chipRow, { marginBottom: 16 }]}>
            {cats.map((c) => (
              <TouchableOpacity key={c}
                style={[styles.chip, { borderColor: TGColors.clay }, category === c && { backgroundColor: TGColors.clay }]}
                onPress={() => setCategory(c)}>
                <Text style={[styles.chipText, { color: category === c ? TGColors.background : TGColors.clay }]}>
                  {catLabel(c)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <DatePickerField label="Date" value={date} onChange={setDate} />
          <TouchableOpacity style={styles.exceptionTimeToggle} onPress={() => setUseTime((v) => !v)}>
            <Text style={styles.exceptionTimeToggleText}>
              {useTime ? '▾  Hide time range' : '▸  Add time range (optional)'}
            </Text>
          </TouchableOpacity>
          {useTime && (
            <View style={styles.exceptionTimeRow}>
              <View style={{ flex: 1 }}><TimePickerField label="From" value={start} onChange={setStart} /></View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}><TimePickerField label="To" value={end} onChange={setEnd} /></View>
            </View>
          )}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} multiline
              placeholderTextColor={TGColors.muted} placeholder="Anything to remember…" value={note} onChangeText={setNote} />
          </View>
          <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.clay }]} onPress={handleSave}>
            <Text style={styles.goldBtnText}>Save exception</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Expandable Bottom Action Bar ─────────────────────────────────────────────

function ActionBar({ onCheckRequest, onException, bottomInset }) {
  const [expanded, setExpanded] = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(animHeight, { toValue, useNativeDriver: false, tension: 60, friction: 10 }).start();
    setExpanded(!expanded);
  };

  // maxHeight from 0→140 so the Animated.View fully collapses out of layout flow
  const maxH = animHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 140] });

  return (
    <View style={[styles.actionBar, { paddingBottom: bottomInset + 8 }]}>
      {/* Expanded options — maxHeight collapses fully to 0 with no residual layout space */}
      <Animated.View style={{ maxHeight: maxH, overflow: 'hidden' }}>
        <View style={styles.actionExpanded}>
          <TouchableOpacity style={styles.actionOption} onPress={() => { setExpanded(false); animHeight.setValue(0); onCheckRequest(); }}>
            <Text style={styles.actionOptionIcon}>🛡</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionOptionTitle}>Someone's asking for my time</Text>
              <Text style={styles.actionOptionSub}>Check if the slot conflicts with your commitments</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity style={styles.actionOption} onPress={() => { setExpanded(false); animHeight.setValue(0); onException(); }}>
            <Text style={styles.actionOptionIcon}>🌿</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionOptionTitle, { color: TGColors.clay }]}>Need an exception</Text>
              <Text style={styles.actionOptionSub}>Rest, health, emergency — never counted against you</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Collapsed trigger */}
      <TouchableOpacity style={styles.actionTrigger} onPress={toggle}>
        <Text style={styles.actionTriggerText}>{expanded ? '▼  Close' : '▲  What do you need?'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function TimeGuardianHome() {
  const router     = useRouter();
  const insets     = useSafeAreaInsets();
  const listRef    = useRef(null);

  const {
    isLoading, anchorDate, customBlocks, weekPlans,
    currentWorkHours, currentRotationDefaults,
    todaySessionEntries, saveAnchorDate, logEntry, checkInEnergy, setWeekPlan,
    getTasksForDate,
  } = useTimeGuardian();

  const [weekOffset,     setWeekOffset]     = useState(0);
  const [checkModal,     setCheckModal]     = useState(false);
  const [exceptionModal, setExceptionModal] = useState(false);
  const [selectedBlock,  setSelectedBlock]  = useState(null);
  const [weekPlanModal,  setWeekPlanModal]  = useState(false);
  const [planningWeek,   setPlanningWeek]   = useState(null);

  const weekDates  = useMemo(() => getWeekDatesForOffset(weekOffset), [weekOffset]);
  const rangeLabel = useMemo(() => weekRangeLabel(weekDates), [weekDates]);
  const isThisWeek = weekOffset === 0;
  const today      = todayStr();
  const todayIndex = useMemo(() => weekDates.indexOf(today), [weekDates, today]);

  // The Monday of the current viewed week — used as the WeekPlan storage key
  const weekMonday      = weekDates[0];
  const isSatoriWeek    = isSecondWeekOfMonth(weekMonday);
  const currentWeekPlan = weekPlans[weekMonday] || null;

  useEffect(() => {
    if (isThisWeek && todayIndex >= 0 && listRef.current) {
      // Small delay to let layout complete before scrolling
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: todayIndex, animated: true, viewPosition: 0 });
      }, 300);
    }
  }, [isThisWeek, todayIndex]);

  // scrollPadding only needs to clear the action bar trigger height + safe area bottom.
  // Tab bar is a sibling layout element, not stacked on top of the action bar.
  const ACTION_BAR_COLLAPSED_H = 60;
  const scrollPadding          = insets.bottom + ACTION_BAR_COLLAPSED_H + 8;

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={TGColors.gold} /></View>;
  if (!anchorDate) return <AnchorPrompt onSave={(d) => saveAnchorDate(d)} />;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={weekDates}
        keyExtractor={(d) => d}
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollPadding }]}
        initialScrollIndex={isThisWeek && todayIndex > 0 ? todayIndex : 0}
        getItemLayout={(_, index) => ({ length: 180, offset: 180 * index, index })}
        onScrollToIndexFailed={({ index }) => {
          // Fallback if layout not ready yet
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true }), 200);
        }}
        ListHeaderComponent={
          <>
            {isThisWeek && (
              <SessionEnergyCard
                todayEntries={todaySessionEntries}
                currentWorkHours={currentWorkHours}
                onCheckIn={(level, cause, session) => checkInEnergy(level, cause, session)}
              />
            )}

            {/* Week navigation */}
            <View style={styles.weekNav}>
              <TouchableOpacity style={styles.navArrowBtn} onPress={() => setWeekOffset((o) => o - 1)}>
                <Text style={styles.navArrow}>‹</Text>
              </TouchableOpacity>
              <View style={styles.weekNavCenter}>
                <Text style={styles.weekRangeLabel}>{rangeLabel}</Text>
                {isSatoriWeek && <Text style={styles.satoriTag}>🌿 Satori week</Text>}
                {!isThisWeek && (
                  <TouchableOpacity onPress={() => setWeekOffset(0)}>
                    <Text style={styles.thisWeekLink}>Back to this week</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.navArrowBtn} onPress={() => setWeekOffset((o) => o + 1)}>
                <Text style={styles.navArrow}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Week plan + nav links */}
            <View style={styles.weekActions}>
              <TouchableOpacity onPress={() => { setPlanningWeek(weekMonday); setWeekPlanModal(true); }}>
                <Text style={styles.weekAction}>
                  {isSatoriWeek ? '🌿 Satori' : currentWeekPlan ? `📅 ${SUNDAY_TYPE_LABELS[currentWeekPlan.sundayType] || 'Planned'}` : '📅 Plan this week'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/tabs/timeguardian/ledger')} style={{ marginLeft: 12 }}>
                <Text style={styles.weekAction}>Ledger</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/tabs/timeguardian/settings')} style={{ marginLeft: 12 }}>
                <Text style={styles.weekAction}>Settings</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({ item: d }) => (
          <DaySection
            key={d} dateStr={d}
            customBlocks={customBlocks}
            weekPlan={weekPlans[weekMonday]}
            onBlockPress={setSelectedBlock}
            onDayPress={() => router.push({ pathname: '/tabs/timeguardian/day', params: { date: d } })}
          />
        )}
      />

      {/* Fixed action bar at bottom */}
      <ActionBar
        onCheckRequest={() => setCheckModal(true)}
        onException={() => setExceptionModal(true)}
        bottomInset={insets.bottom}
      />

      <BlockDetailSheet block={selectedBlock} onClose={() => setSelectedBlock(null)} />

      <WeekPlanModal
        visible={weekPlanModal}
        weekStartDate={planningWeek || weekMonday}
        currentPlan={weekPlans[planningWeek || weekMonday] || null}
        isSatoriWeek={isSecondWeekOfMonth(planningWeek || weekMonday)}
        onSave={setWeekPlan}
        onClose={() => { setWeekPlanModal(false); setPlanningWeek(null); }}
      />

      <CheckRequestModal
        visible={checkModal} onClose={() => setCheckModal(false)}
        anchorDate={anchorDate}
        customBlocks={customBlocks}
        workHours={currentWorkHours}
        rotationSchedule={currentRotationDefaults}
        getTasksForDate={getTasksForDate}
        onLog={logEntry}
      />
      <ExceptionModal visible={exceptionModal} onClose={() => setExceptionModal(false)} onLog={logEntry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container : { flex: 1, backgroundColor: TGColors.background },
  centered  : { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: TGColors.background },
  scroll    : { padding: 16 },

  anchorWrap : { flex: 1, backgroundColor: TGColors.background, padding: 28, justifyContent: 'center' },
  anchorTitle: { fontSize: 26, color: TGColors.ink, fontWeight: '700', marginBottom: 14 },
  anchorBody : { fontSize: 14, color: TGColors.muted, lineHeight: 22, marginBottom: 24 },

  // Session energy card
  sessionCard          : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 14, marginBottom: 16 },
  sessionCardChevron   : { color: TGColors.faint, fontSize: 11, marginLeft: 10, alignSelf: 'center' },
  sessionDaySummary    : { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sessionCardTitle     : { color: TGColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  sessionDayLabel      : { fontSize: 15, fontWeight: '700' },
  sessionDayScoreBadge : { borderWidth: 2, borderRadius: 28, width: 56, height: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  sessionDayScoreNum   : { fontSize: 18, fontWeight: '800' },
  sessionDayScoreDenom : { color: TGColors.faint, fontSize: 10, alignSelf: 'flex-end', marginBottom: 3 },
  sessionDayScoreEmpty : { color: TGColors.faint, fontSize: 11 },
  sessionDotsRow       : { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  sessionDotItem       : { alignItems: 'center', gap: 3 },
  sessionDot           : { width: 10, height: 10, borderRadius: 5 },
  sessionDotLabel      : { fontSize: 10, color: TGColors.faint },
  sessionDotFill       : { flex: 1 },
  sessionDotStatus     : { color: TGColors.muted, fontSize: 11, fontWeight: '500' },
  sessionRow           : { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  sessionRowActive     : { backgroundColor: TGColors.surfaceRaised, marginHorizontal: -14, paddingHorizontal: 14, borderRadius: 8, borderBottomWidth: 0, marginBottom: 1 },
  sessionMeta          : { flex: 1 },
  sessionNameRow       : { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  sessionIcon          : { fontSize: 16 },
  sessionName          : { color: TGColors.ink, fontSize: 13, fontWeight: '600' },
  sessionNowTag        : { fontSize: 10, fontWeight: '500', color: TGColors.gold },
  sessionTime          : { color: TGColors.faint, fontSize: 10 },
  sessionLastEntry     : { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, paddingLeft: 24 },
  sessionLastLevel     : { fontSize: 12, fontWeight: '700' },
  sessionLastCause     : { color: TGColors.muted, fontSize: 11 },
  sessionLastTime      : { color: TGColors.faint, fontSize: 10, marginLeft: 'auto' },
  sessionCheckBtn      : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, minWidth: 64, alignItems: 'center' },
  sessionCheckBtnText  : { color: TGColors.faint, fontSize: 12, fontWeight: '500' },
  sessionInputArea     : { flex: 1, alignItems: 'flex-end' },
  sessionLevelRow      : { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' },
  sessionLevelBtn      : { borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  sessionLevelText     : { fontSize: 10, fontWeight: '600' },
  sessionCauseLabel    : { color: TGColors.muted, fontSize: 10, marginBottom: 5, textAlign: 'right' },
  sessionCauseRow      : { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' },
  sessionCauseChip     : { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  sessionCauseChipText : { fontSize: 10, fontWeight: '500' },
  sessionCancelBtn     : { marginTop: 6 },
  sessionCancelText    : { color: TGColors.faint, fontSize: 10 },

  weekNav       : { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  navArrowBtn   : { padding: 10 },
  navArrow      : { color: TGColors.gold, fontSize: 28, fontWeight: '300', lineHeight: 32 },
  weekNavCenter : { flex: 1, alignItems: 'center' },
  weekRangeLabel: { color: TGColors.ink, fontSize: 15, fontWeight: '600' },
  satoriTag     : { color: TGColors.sage, fontSize: 12, marginTop: 2 },
  thisWeekLink  : { color: TGColors.gold, fontSize: 12, marginTop: 4 },
  weekActions   : { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 4 },
  weekAction    : { color: TGColors.gold, fontSize: 13, fontWeight: '500' },

  dayCard     : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
  dayCardToday: { borderWidth: 1, borderColor: TGColors.gold },
  dayHeader   : { marginBottom: 10 },
  dayName     : { color: TGColors.ink, fontWeight: '700', fontSize: 15 },
  todayTag    : { color: TGColors.gold, fontSize: 12, fontWeight: '500' },
  dayDate     : { color: TGColors.muted, fontSize: 12, marginTop: 2 },
  openText    : { color: TGColors.faint, fontSize: 13, fontStyle: 'italic' },
  dayTapHint  : { color: TGColors.faint, fontSize: 11, marginTop: 8, textAlign: 'right', fontStyle: 'italic' },

  blockRow    : { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingVertical: 2 },
  blockBar    : { width: 3, borderRadius: 2, minHeight: 32, marginRight: 10 },
  blockLabel  : { color: TGColors.ink, fontSize: 13, fontWeight: '500' },
  blockTime   : { color: TGColors.muted, fontSize: 11, marginTop: 2 },
  blockChevron: { color: TGColors.faint, fontSize: 16, marginLeft: 6 },
  softTag     : { backgroundColor: TGColors.surfaceRaised, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  softTagText : { color: TGColors.faint, fontSize: 10 },

  actionBar        : { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: TGColors.surface, borderTopWidth: 1, borderTopColor: TGColors.line },
  actionTrigger    : { paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center' },
  actionTriggerText: { color: TGColors.gold, fontWeight: '700', fontSize: 16 },
  actionExpanded   : { backgroundColor: TGColors.surface },
  actionOption     : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
  actionOptionIcon : { fontSize: 24 },
  actionOptionTitle: { color: TGColors.ink, fontSize: 15, fontWeight: '600' },
  actionOptionSub  : { color: TGColors.muted, fontSize: 12, marginTop: 2 },
  actionDivider    : { height: 1, backgroundColor: TGColors.line, marginHorizontal: 20 },

  satoriBadge    : { backgroundColor: TGColors.surfaceRaised, borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: TGColors.sage },
  satoriBadgeText: { color: TGColors.sage, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  satoriBadgeSub : { color: TGColors.muted, fontSize: 13, lineHeight: 20 },
  pastWarning    : { backgroundColor: '#3A2010', borderRadius: 10, padding: 14, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: TGColors.clay },
  pastWarningText: { color: TGColors.clay, fontSize: 13 },
  chipCol        : { gap: 8, marginTop: 6 },
  optionBtn      : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 10, padding: 14 },
  optionBtnActive: { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  optionBtnText  : { color: TGColors.muted, fontSize: 14 },
  optionBtnTextActive: { color: TGColors.background, fontWeight: '600' },

  customReadonlyCard : { flexDirection: 'row', alignItems: 'center', backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: TGColors.goldDim },
  customReadonlyMeta : { color: TGColors.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  customReadonlyValue: { color: TGColors.ink, fontSize: 14, fontWeight: '600' },
  customEditBtn      : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TGColors.gold, marginLeft: 10 },
  customEditBtnText  : { color: TGColors.gold, fontSize: 12, fontWeight: '600' },
  editReasonCard     : { backgroundColor: '#1a1200', borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: TGColors.clay },
  editReasonTitle    : { color: TGColors.clay, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  editReasonSub      : { color: TGColors.muted, fontSize: 11, marginBottom: 8 },

  modal      : { flex: 1, backgroundColor: TGColors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  modalTitle : { color: TGColors.ink, fontSize: 17, fontWeight: '700' },
  modalClose : { color: TGColors.muted, fontSize: 18 },
  modalScroll: { padding: 20, paddingBottom: 60 },

  fieldGroup  : { marginBottom: 14 },
  fieldLabel  : { color: TGColors.muted, fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input       : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, color: TGColors.ink, fontSize: 14, borderWidth: 1, borderColor: TGColors.line },
  pickerBtn   : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: TGColors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerBtnText: { color: TGColors.ink, fontSize: 14 },

  chipRow      : { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip         : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive   : { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  chipText     : { color: TGColors.muted, fontSize: 13 },
  chipTextActive: { color: TGColors.background, fontWeight: '600' },

  goldBtn    : { backgroundColor: TGColors.gold, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 16 },
  goldBtnText: { color: TGColors.background, fontWeight: '700', fontSize: 15 },
  ghostBtn   : { padding: 14, alignItems: 'center', marginTop: 4 },
  ghostBtnText: { color: TGColors.muted, fontSize: 14 },

  resultTitle : { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  resultSub   : { color: TGColors.muted, fontSize: 14, marginBottom: 8 },

  conflictCard        : { backgroundColor: TGColors.surface, borderRadius: 10, padding: 14, borderLeftWidth: 4, marginBottom: 10 },
  conflictLabel       : { color: TGColors.ink, fontWeight: '600', fontSize: 15 },
  conflictTime        : { color: TGColors.muted, fontSize: 12, marginTop: 4 },
  conflictMeta        : { flexDirection: 'row', marginTop: 8, gap: 8, flexWrap: 'wrap' },
  conflictCategoryPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  conflictCategoryText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  conflictTypePill    : { backgroundColor: TGColors.surfaceRaised, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  conflictTypeText    : { color: TGColors.muted, fontSize: 11 },
  conflictWarning     : { color: TGColors.clay, fontSize: 13, marginBottom: 12, lineHeight: 20 },
  showAllBtn          : { paddingVertical: 10, alignItems: 'center', marginBottom: 4 },
  showAllBtnText      : { color: TGColors.gold, fontSize: 13, fontWeight: '600' },

  exceptionNote          : { color: TGColors.muted, fontSize: 13, lineHeight: 20, marginBottom: 16, fontStyle: 'italic' },
  exceptionTimeToggle    : { paddingVertical: 10, marginBottom: 8 },
  exceptionTimeToggleText: { color: TGColors.gold, fontSize: 13, fontWeight: '500' },
  exceptionTimeRow       : { flexDirection: 'row', marginBottom: 4 },
  exceptionConfirmCard   : { flexDirection: 'row', gap: 14, backgroundColor: TGColors.surfaceRaised, borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: TGColors.clay, width: '100%' },
  exceptionConfirmIcon   : { fontSize: 28, marginTop: 2 },
  exceptionConfirmTitle  : { color: TGColors.ink, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  exceptionConfirmDate   : { color: TGColors.clay, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  exceptionConfirmNote   : { color: TGColors.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  exceptionConfirmSub    : { color: TGColors.faint, fontSize: 12, lineHeight: 18 },

  detailBar    : { height: 4, borderRadius: 2, marginBottom: 16 },
  detailLabel  : { color: TGColors.ink, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  detailTime   : { color: TGColors.muted, fontSize: 14, marginBottom: 20 },
  detailRow    : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  detailMeta   : { color: TGColors.muted, fontSize: 13 },
  detailValue  : { color: TGColors.ink, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  detailHint   : { marginTop: 16, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: TGColors.goldDim },
  detailHintText: { color: TGColors.gold, fontSize: 13 },
});
