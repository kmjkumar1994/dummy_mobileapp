/**
 * index.jsx — v5
 * Week starts Sunday, expandable bottom action bar,
 * day cards tappable, week plan editor per week.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
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
  TGColors, TGCategoryColors, TGEnergyColors, TGEnergyLabels, DAY_LABELS_FULL,
} from '../../../timeguardian/theme/tokens';
import {
  SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS,
  isSecondWeekOfMonth, getSundayOfWeek,
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

// ─── Energy Check-in ─────────────────────────────────────────────────────────

function EnergyCheckIn({ todayEnergy, onCheckIn }) {
  const [pendingLevel, setPendingLevel] = useState(null);
  const causes = ['Work', 'Family', 'Karmayoga', 'Health', 'Other'];

  const handleLevel = (l) => {
    setPendingLevel(l);
    if (l >= 3) { onCheckIn(l, null); setPendingLevel(null); }
  };

  return (
    <View style={styles.energyCard}>
      <Text style={styles.energyHeading}>
        How are you today?
        {todayEnergy
          ? <Text style={{ color: TGEnergyColors[todayEnergy.level], fontWeight: '600' }}>
              {'  '}{TGEnergyLabels[todayEnergy.level]}
            </Text>
          : null}
      </Text>
      <View style={styles.chipRow}>
        {[1,2,3,4,5].map((l) => (
          <TouchableOpacity key={l} style={[styles.energyBtn, { borderColor: TGEnergyColors[l] }]} onPress={() => handleLevel(l)}>
            <Text style={[styles.energyBtnText, { color: TGEnergyColors[l] }]}>{TGEnergyLabels[l]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {pendingLevel !== null && pendingLevel <= 2 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.fieldLabel}>What's causing this?</Text>
          <View style={styles.chipRow}>
            {causes.map((c) => (
              <TouchableOpacity key={c} style={styles.causeChip}
                onPress={() => { onCheckIn(pendingLevel, c); setPendingLevel(null); }}>
                <Text style={styles.causeChipText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
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
    <TouchableOpacity
      style={[styles.dayCard, isToday && styles.dayCardToday]}
      onPress={onDayPress}
      activeOpacity={0.85}
    >
      <View style={styles.dayHeader}>
        <Text style={[styles.dayName, isToday && { color: TGColors.gold }]}>
          {DAY_LABELS_FULL[d.getDay()]}
          {isToday ? <Text style={styles.todayTag}>  Today</Text> : null}
        </Text>
        <Text style={styles.dayDate}>
          {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>
      {visible.length === 0
        ? <Text style={styles.openText}>open — nothing claimed yet</Text>
        : visible.map((b, i) => <BlockRow key={i} block={b} onPress={onBlockPress} />)}
      <Text style={styles.dayTapHint}>Tap to view & add tasks →</Text>
    </TouchableOpacity>
  );
}

// ─── Week Plan Editor ─────────────────────────────────────────────────────────

function WeekPlanModal({ visible, weekStartDate, currentPlan, isSatoriWeek, onSave, onClose }) {
  const sundayOptions  = Object.entries(SUNDAY_TYPE_LABELS);
  const saturdayOptions = Object.entries(SATURDAY_TYPE_LABELS);

  const [sundayType,   setSundayType]   = useState(currentPlan?.sundayType   || 'open');
  const [saturdayType, setSaturdayType] = useState(currentPlan?.saturdayType || 'open');
  const [reason,       setReason]       = useState('');
  const today = todayStr();
  const isPast = weekStartDate < today;

  useEffect(() => {
    if (visible) {
      setSundayType(currentPlan?.sundayType   || 'open');
      setSaturdayType(currentPlan?.saturdayType || 'open');
      setReason('');
    }
  }, [visible, currentPlan]);

  const handleSave = () => {
    if (!reason.trim()) { Alert.alert('Reason required', 'Please explain why this week is being changed.'); return; }
    onSave(weekStartDate, { sundayType, saturdayType }, reason);
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

          <Text style={styles.fieldLabel}>Sunday commitment</Text>
          <View style={styles.chipCol}>
            {sundayOptions.map(([key, label]) => (
              <TouchableOpacity key={key}
                style={[styles.optionBtn, sundayType === key && styles.optionBtnActive]}
                onPress={() => setSundayType(key)}>
                <Text style={[styles.optionBtnText, sundayType === key && styles.optionBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Saturday</Text>
          <View style={styles.chipCol}>
            {saturdayOptions.map(([key, label]) => (
              <TouchableOpacity key={key}
                style={[styles.optionBtn, saturdayType === key && styles.optionBtnActive]}
                onPress={() => setSaturdayType(key)}>
                <Text style={[styles.optionBtnText, saturdayType === key && styles.optionBtnTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
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

// ─── Check Request Modal ──────────────────────────────────────────────────────

function CheckRequestModal({ visible, onClose, customBlocks, onLog }) {
  const [label,    setLabel]    = useState('');
  const [date,     setDate]     = useState(todayStr());
  const [start,    setStart]    = useState('');
  const [duration, setDuration] = useState('1h');
  const [result,   setResult]   = useState(null);
  const [movedTo,  setMovedTo]  = useState('');
  const durations = Object.keys(DURATION_PRESETS);

  const reset = () => { setLabel(''); setDate(todayStr()); setStart(''); setDuration('1h'); setResult(null); setMovedTo(''); };

  const handleCheck = async () => {
    if (!label.trim() || !date || !start) { Alert.alert('Missing fields'); return; }
    const reqStart = duration === 'whole day' ? WHOLE_DAY_START : start;
    const reqEnd   = duration === 'whole day' ? WHOLE_DAY_END   : computeEndTime(start, DURATION_PRESETS[duration]);
    const blocks   = await getBlocksForDate(date, customBlocks);
    const conflict = findConflict(date, reqStart, reqEnd, blocks);
    setResult({ ...conflict, reqStart, reqEnd });
  };

  const handleLog = async (outcome) => {
    await onLog({ date, start: result.reqStart, end: result.reqEnd, requestLabel: label, outcome, displaced: result.block?.label ?? null, movedTo: movedTo || null });
    reset(); onClose();
  };

  const isSleep = result?.block?.category === 'sleep';

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
                <TextInput style={styles.input} placeholderTextColor={TGColors.muted} placeholder="Label" value={label} onChangeText={setLabel} />
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
              <TouchableOpacity style={styles.goldBtn} onPress={handleCheck}>
                <Text style={styles.goldBtnText}>Check this slot</Text>
              </TouchableOpacity>
            </>
          ) : result.block === null ? (
            <View>
              <Text style={[styles.resultTitle, { color: TGColors.sage }]}>This slot is open</Text>
              <Text style={styles.resultSub}>{label} fits without conflict.</Text>
              <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.sage }]} onPress={() => handleLog('open')}>
                <Text style={styles.goldBtnText}>Log it as booked</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setResult(null)}>
                <Text style={styles.ghostBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={[styles.resultTitle, { color: isSleep ? TGColors.night : TGColors.clay }]}>
                {isSleep ? 'This eats into sleep' : 'Conflict found'}
              </Text>
              <View style={[styles.conflictCard, { borderLeftColor: isSleep ? TGColors.night : TGColors.clay }]}>
                <Text style={styles.conflictLabel}>{result.block.label}</Text>
                <Text style={styles.conflictTime}>{result.block.start} – {result.block.end}</Text>
              </View>
              {result.count > 1 && <Text style={styles.conflictExtra}>Also overlaps {result.count - 1} other block{result.count - 1 > 1 ? 's' : ''}.</Text>}
              <Text style={styles.conflictWarning}>Saying yes here means that gets moved, shortened, or dropped.</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Where does it move to? (optional)</Text>
                <TextInput style={styles.input} placeholderTextColor={TGColors.muted} placeholder="e.g. tomorrow morning" value={movedTo} onChangeText={setMovedTo} />
              </View>
              <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.sage }]} onPress={() => handleLog('protected')}>
                <Text style={styles.goldBtnText}>Protect it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.clay }]} onPress={() => handleLog('yielded')}>
                <Text style={styles.goldBtnText}>Yield this time</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setResult(null)}>
                <Text style={styles.ghostBtnText}>Back</Text>
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
  const [note, setNote] = useState('');
  const cats = ['rest', 'health', 'emergency', 'other'];
  const reset = () => { setCategory(null); setNote(''); };
  const handleSave = async () => {
    if (!category) { Alert.alert('Select a category'); return; }
    await onLog({ date: todayStr(), start: nowTimeStr(), end: nowTimeStr(), requestLabel: `Exception — ${category}`, outcome: 'exception', category, note: note || null });
    reset(); onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Need an exception</Text>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <Text style={styles.exceptionNote}>
            This is not yielding to someone else's ask. Exceptions are never counted against you — they're your body or life requiring care.
          </Text>
          <View style={styles.chipRow}>
            {cats.map((c) => (
              <TouchableOpacity key={c}
                style={[styles.chip, { borderColor: TGColors.clay }, category === c && { backgroundColor: TGColors.clay }]}
                onPress={() => setCategory(c)}>
                <Text style={[styles.chipText, { color: category === c ? TGColors.background : TGColors.clay }]}>
                  {c === 'rest' ? 'Rest / burnout' : c.charAt(0).toUpperCase() + c.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
  const [expanded, setExpanded]   = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(animHeight, { toValue, useNativeDriver: false, tension: 60, friction: 10 }).start();
    setExpanded(!expanded);
  };

  const expandedH = animHeight.interpolate({ inputRange: [0,1], outputRange: [0, 110] });

  return (
    <View style={[styles.actionBar, { paddingBottom: bottomInset + 8 }]}>
      {/* Expanded options */}
      <Animated.View style={[styles.actionExpanded, { height: expandedH, overflow: 'hidden' }]}>
        <TouchableOpacity style={styles.actionOption} onPress={() => { setExpanded(false); animHeight.setValue(0); onCheckRequest(); }}>
          <Text style={styles.actionOptionIcon}>🛡</Text>
          <View>
            <Text style={styles.actionOptionTitle}>Someone's asking for my time</Text>
            <Text style={styles.actionOptionSub}>Check if the slot conflicts with your commitments</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.actionDivider} />
        <TouchableOpacity style={styles.actionOption} onPress={() => { setExpanded(false); animHeight.setValue(0); onException(); }}>
          <Text style={styles.actionOptionIcon}>🌿</Text>
          <View>
            <Text style={[styles.actionOptionTitle, { color: TGColors.clay }]}>Need an exception</Text>
            <Text style={styles.actionOptionSub}>Rest, health, emergency — never counted against you</Text>
          </View>
        </TouchableOpacity>
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
  const scrollRef  = useRef(null);

  const {
    isLoading, anchorDate, customBlocks, weekPlans,
    todayEnergy, saveAnchorDate, logEntry, checkInEnergy, setWeekPlan,
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

  // The Sunday of the current viewed week
  const weekSunday  = weekDates[0];
  const isSatoriWeek = isSecondWeekOfMonth(weekSunday);
  const currentWeekPlan = weekPlans[weekSunday] || null;

  useEffect(() => {
    if (isThisWeek && todayIndex >= 0 && scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollTo({ y: todayIndex * 170, animated: true }), 400);
    }
  }, [isThisWeek, todayIndex]);

  // Action bar height = its own height + tab bar + bottom inset
  const ACTION_BAR_HEIGHT = 52;
  const TAB_BAR_HEIGHT    = 60;
  const scrollPadding     = insets.bottom + TAB_BAR_HEIGHT + ACTION_BAR_HEIGHT + 20;

  if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" color={TGColors.gold} /></View>;
  if (!anchorDate) return <AnchorPrompt onSave={(d) => saveAnchorDate(d)} />;

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, { paddingBottom: scrollPadding }]}>

        {isThisWeek && <EnergyCheckIn todayEnergy={todayEnergy} onCheckIn={checkInEnergy} />}

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
          <TouchableOpacity onPress={() => { setPlanningWeek(weekSunday); setWeekPlanModal(true); }}>
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

        {weekDates.map((d) => (
          <DaySection
            key={d} dateStr={d}
            customBlocks={customBlocks}
            weekPlan={weekPlans[weekSunday]}
            onBlockPress={setSelectedBlock}
            onDayPress={() => router.push({ pathname: '/tabs/timeguardian/day', params: { date: d } })}
          />
        ))}
      </ScrollView>

      {/* Fixed action bar at bottom */}
      <ActionBar
        onCheckRequest={() => setCheckModal(true)}
        onException={() => setExceptionModal(true)}
        bottomInset={insets.bottom + TAB_BAR_HEIGHT}
      />

      <BlockDetailSheet block={selectedBlock} onClose={() => setSelectedBlock(null)} />

      <WeekPlanModal
        visible={weekPlanModal}
        weekStartDate={planningWeek || weekSunday}
        currentPlan={currentWeekPlan}
        isSatoriWeek={isSatoriWeek}
        onSave={setWeekPlan}
        onClose={() => setWeekPlanModal(false)}
      />

      <CheckRequestModal
        visible={checkModal} onClose={() => setCheckModal(false)}
        customBlocks={customBlocks} onLog={logEntry}
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

  energyCard   : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 16 },
  energyHeading: { color: TGColors.muted, fontSize: 13, marginBottom: 12 },
  energyBtn    : { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  energyBtnText: { fontSize: 12, fontWeight: '500' },
  causeChip    : { backgroundColor: TGColors.surfaceRaised, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  causeChipText: { color: TGColors.ink, fontSize: 12 },

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

  // Action bar
  actionBar      : { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: TGColors.surface, borderTopWidth: 1, borderTopColor: TGColors.line },
  actionTrigger  : { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  actionTriggerText: { color: TGColors.gold, fontWeight: '600', fontSize: 14 },
  actionExpanded : { backgroundColor: TGColors.surface },
  actionOption   : { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  actionOptionIcon: { fontSize: 22 },
  actionOptionTitle: { color: TGColors.ink, fontSize: 14, fontWeight: '600' },
  actionOptionSub : { color: TGColors.muted, fontSize: 12, marginTop: 2 },
  actionDivider  : { height: 1, backgroundColor: TGColors.line, marginHorizontal: 20 },

  // Week plan modal
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

  // Modal shared
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

  resultTitle    : { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  resultSub      : { color: TGColors.muted, fontSize: 14, marginBottom: 8 },
  conflictCard   : { backgroundColor: TGColors.surface, borderRadius: 10, padding: 14, borderLeftWidth: 4, marginBottom: 10 },
  conflictLabel  : { color: TGColors.ink, fontWeight: '600', fontSize: 15 },
  conflictTime   : { color: TGColors.muted, fontSize: 12, marginTop: 4 },
  conflictExtra  : { color: TGColors.muted, fontSize: 12, marginBottom: 8 },
  conflictWarning: { color: TGColors.clay, fontSize: 13, marginBottom: 12, lineHeight: 20 },
  exceptionNote  : { color: TGColors.muted, fontSize: 13, lineHeight: 20, marginBottom: 20, fontStyle: 'italic' },

  detailBar    : { height: 4, borderRadius: 2, marginBottom: 16 },
  detailLabel  : { color: TGColors.ink, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  detailTime   : { color: TGColors.muted, fontSize: 14, marginBottom: 20 },
  detailRow    : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  detailMeta   : { color: TGColors.muted, fontSize: 13 },
  detailValue  : { color: TGColors.ink, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  detailHint   : { marginTop: 16, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: TGColors.goldDim },
  detailHintText: { color: TGColors.gold, fontSize: 13 },
});
