/**
 * app/tabs/timeguardian/day.jsx
 * Day Detail screen — shows all blocks for a date with small tasks nested inside.
 * Tasks can be added (one-off), marked done, toggled protected.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, Switch, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { getBlocksForDate, getDayOfWeek, toDisplayDate } from '../../../timeguardian/logic/dayBlocks';
import { TGColors, TGCategoryColors, DAY_LABELS_FULL } from '../../../timeguardian/theme/tokens';
import { DAY_OVERRIDE_TYPES } from '../../../timeguardian/storage/repository';

const TASK_CATEGORIES = ['work', 'self', 'health', 'family', 'other'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Nests tasks inside the block they fall within based on time.
 * Tasks outside any block go into an "Open time" bucket.
 */
function buildDayTimeline(blocks, tasks) {
  const visibleBlocks = blocks.filter((b) => b.category !== 'sleep');

  return visibleBlocks.map((block) => {
    const blockStart = toMinutes(block.start);
    const blockEnd   = toMinutes(block.end);
    const nested     = tasks.filter((t) => {
      const tStart = toMinutes(t.time);
      return tStart >= blockStart && tStart < blockEnd;
    });
    return { block, tasks: nested.sort((a, b) => (a.time < b.time ? -1 : 1)) };
  });
}

function getUnassignedTasks(blocks, tasks) {
  const visibleBlocks = blocks.filter((b) => b.category !== 'sleep');
  return tasks.filter((t) => {
    const tStart = toMinutes(t.time);
    return !visibleBlocks.some((b) => tStart >= toMinutes(b.start) && tStart < toMinutes(b.end));
  });
}

/**
 * Returns a hint string if any exception overlaps this block's time window.
 * e.g. "Rest / burnout  ·  11:00 – 13:00  ·  migraine"
 */
function getExceptionHintForBlock(block, exceptions) {
  if (!exceptions || exceptions.length === 0) return null;
  const bStart = toMinutes(block.start);
  const bEnd   = toMinutes(block.end);
  const catLabel = (c) =>
    c === 'rest' ? 'Rest / burnout' : c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Exception';

  for (const ex of exceptions) {
    const eStart = ex.start ? toMinutes(ex.start) : 0;
    const eEnd   = ex.end   ? toMinutes(ex.end)   : 1439;
    // overlaps if either has no time (whole-day) or windows intersect
    const wholeDayException = !ex.start || ex.start === ex.end;
    const overlaps = wholeDayException || (eStart < bEnd && eEnd > bStart);
    if (overlaps) {
      const timeStr = wholeDayException ? '' : `  ·  ${ex.start}${ex.end && ex.end !== ex.start ? ` – ${ex.end}` : ''}`;
      const noteStr = ex.note ? `  ·  ${ex.note}` : '';
      return `${catLabel(ex.category)}${timeStr}${noteStr}`;
    }
  }
  return null;
}

// ─── Time picker ─────────────────────────────────────────────────────────────

function TimePickerField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  const timeObj = (() => {
    const d = new Date();
    if (value) { const [h, m] = value.split(':').map(Number); d.setHours(h, m, 0, 0); }
    return d;
  })();
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

// ─── Task form modal ──────────────────────────────────────────────────────────

function TaskFormModal({ visible, initial, defaultTime, onSave, onClose }) {
  const { notifPrefs } = useTimeGuardian();
  const defaultReminder = notifPrefs?.enabled ?? false;

  const [form, setForm] = useState(
    initial || { title: '', time: defaultTime || '', duration: '', category: 'work', note: '', protected: false, reminder: defaultReminder }
  );
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (visible) setForm(
      initial || { title: '', time: defaultTime || '', duration: '', category: 'work', note: '', protected: false, reminder: defaultReminder }
    );
  }, [visible]);

  const handleSave = () => {
    if (!form.title.trim()) { Alert.alert('Title required'); return; }
    if (!form.time)         { Alert.alert('Time required');  return; }
    onSave({
      ...form,
      duration: form.duration ? parseInt(form.duration) : null,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{initial ? 'Edit task' : 'Add task'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.input} value={form.title} onChangeText={(v) => setF('title', v)}
              placeholder="What's this task?" placeholderTextColor={TGColors.muted} />
          </View>

          <TimePickerField label="Time" value={form.time} onChange={(v) => setF('time', v)} />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Duration (minutes, optional)</Text>
            <TextInput style={styles.input} value={form.duration ? String(form.duration) : ''}
              onChangeText={(v) => setF('duration', v)} keyboardType="numeric"
              placeholder="e.g. 30" placeholderTextColor={TGColors.muted} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipRow}>
              {TASK_CATEGORIES.map((c) => (
                <TouchableOpacity key={c}
                  style={[styles.chip, form.category === c && styles.chipActive]}
                  onPress={() => setF('category', c)}>
                  <Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              value={form.note} onChangeText={(v) => setF('note', v)}
              placeholder="Private note…" placeholderTextColor={TGColors.muted} multiline />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Protect this task</Text>
              <Text style={styles.toggleSub}>Protected tasks show as a soft conflict when someone asks for this time.</Text>
            </View>
            <Switch value={form.protected} onValueChange={(v) => setF('protected', v)}
              trackColor={{ false: TGColors.line, true: TGColors.goldDim }}
              thumbColor={form.protected ? TGColors.gold : TGColors.faint} />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Remind me</Text>
              <Text style={styles.toggleSub}>
                {form.reminder
                  ? `Fires ${notifPrefs?.leadMinutes ?? 10} min before (global setting)`
                  : 'No reminder for this task'}
              </Text>
            </View>
            <Switch value={form.reminder ?? defaultReminder} onValueChange={(v) => setF('reminder', v)}
              trackColor={{ false: TGColors.line, true: TGColors.goldDim }}
              thumbColor={(form.reminder ?? defaultReminder) ? TGColors.gold : TGColors.faint} />
          </View>

          <TouchableOpacity style={styles.goldBtn} onPress={handleSave}>
            <Text style={styles.goldBtnText}>{initial ? 'Save changes' : 'Add task'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, onToggleDone, onToggleProtected, onEdit, onDelete }) {
  return (
    <View style={[styles.taskRow, task.done && styles.taskRowDone]}>
      <TouchableOpacity style={styles.taskDoneBtn} onPress={() => onToggleDone(task.id, task.done)}>
        <View style={[styles.taskDoneCircle, task.done && styles.taskDoneCircleChecked]}>
          {task.done && <Text style={styles.taskDoneTick}>✓</Text>}
        </View>
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>{task.title}</Text>
        <Text style={styles.taskMeta}>
          {task.time}{task.duration ? `  ·  ${task.duration} min` : ''}
          {task.isRecurring ? '  ·  recurring' : ''}
          {task.note ? `  ·  ${task.note}` : ''}
        </Text>
      </View>

      {/* Protection toggle */}
      <TouchableOpacity
        style={[styles.protectBtn, task.protected && styles.protectBtnOn]}
        onPress={() => onToggleProtected(task.id, task.protected)}>
        <Text style={[styles.protectBtnText, task.protected && styles.protectBtnTextOn]}>
          {task.protected ? '🔒' : '🔓'}
        </Text>
      </TouchableOpacity>

      {/* Edit / delete — only for one-off tasks */}
      {!task.isRecurring && (
        <>
          <TouchableOpacity style={styles.taskAction} onPress={() => onEdit(task)}>
            <Text style={styles.taskActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.taskAction} onPress={() =>
            Alert.alert('Delete task', `Remove "${task.title}"?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDelete(task.id) },
            ])}>
            <Text style={[styles.taskActionText, { color: TGColors.clay }]}>✕</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ─── Block Detail Sheet ───────────────────────────────────────────────────────

function BlockDetailSheet({ block, onClose }) {
  if (!block) return null;
  const color = TGCategoryColors[block.category] || TGColors.muted;
  const hint = block.category === 'work'
    ? 'Settings → Work Hours'
    : block.category === 'sleep'
    ? null
    : ['family', 'self', 'karmayoga'].includes(block.category)
    ? 'Settings → Rotation or tap "Plan this week" on the home screen'
    : 'Settings → Your Blocks';

  return (
    <Modal visible={!!block} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Block detail</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={[styles.blockDetailBar, { backgroundColor: color }]} />
          <Text style={styles.blockDetailLabel}>{block.label}</Text>
          <Text style={styles.blockDetailTime}>{block.start} – {block.end}</Text>
          <View style={styles.blockDetailRow}>
            <Text style={styles.blockDetailMeta}>Category</Text>
            <Text style={[styles.blockDetailValue, { color, textTransform: 'capitalize' }]}>{block.category}</Text>
          </View>
          <View style={styles.blockDetailRow}>
            <Text style={styles.blockDetailMeta}>Type</Text>
            <Text style={styles.blockDetailValue}>
              {block.type === 'protected' ? '🔒 Protected' : '〜 Soft'}
            </Text>
          </View>
          {hint
            ? <View style={styles.blockDetailHint}><Text style={styles.blockDetailHintText}>To change → {hint}</Text></View>
            : <View style={styles.blockDetailHint}><Text style={styles.blockDetailHintText}>Sleep blocks are fixed and cannot be edited.</Text></View>}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Block section with nested tasks ─────────────────────────────────────────

function BlockSection({ block, tasks, onAddTask, onToggleDone, onToggleProtected, onEdit, onDelete, exceptionHint, onBlockPress }) {
  const color = TGCategoryColors[block.category] || TGColors.muted;
  return (
    <View style={styles.blockSection}>
      {/* Block header — tappable to open block detail */}
      <TouchableOpacity
        style={[styles.blockHeader, { borderLeftColor: color }]}
        onPress={() => onBlockPress(block)}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.blockLabel}>{block.label}</Text>
          <Text style={styles.blockTime}>{block.start} – {block.end}</Text>
          {exceptionHint && (
            <Text style={styles.exceptionHint}>🌿 {exceptionHint}</Text>
          )}
        </View>
        {block.type === 'soft' && <View style={styles.softTag}><Text style={styles.softTagText}>soft</Text></View>}
        <Text style={styles.blockChevron}>›</Text>
      </TouchableOpacity>

      {/* Nested tasks */}
      {tasks.length > 0 && (
        <View style={styles.taskList}>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t}
              onToggleDone={onToggleDone}
              onToggleProtected={onToggleProtected}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </View>
      )}

      {/* Add task inside this block */}
      <TouchableOpacity style={styles.addTaskBtn} onPress={() => onAddTask(block.start)}>
        <Text style={styles.addTaskBtnText}>+ Add task during {block.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Exception Edit Modal ─────────────────────────────────────────────────────

const EXCEPTION_CATS = ['rest', 'health', 'emergency', 'other'];

function catLabel(c) {
  return c === 'rest' ? 'Rest / burnout' : c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Exception';
}

function ExceptionEditModal({ visible, entry, onSave, onDelete, onClose }) {
  const [category,   setCategory]   = useState('');
  const [exDate,     setExDate]     = useState('');
  const [showDate,   setShowDate]   = useState(false);
  const [useTime,    setUseTime]    = useState(false);
  const [start,      setStart]      = useState('');
  const [end,        setEnd]        = useState('');
  const [note,       setNote]       = useState('');

  // Pre-fill every time the entry changes
  useEffect(() => {
    if (entry) {
      setCategory(entry.category || 'other');
      setExDate(entry.date || '');
      setShowDate(false);
      const hasTime = entry.start && entry.start !== entry.end;
      setUseTime(!!hasTime);
      setStart(entry.start || '');
      setEnd(entry.end   || '');
      setNote(entry.note || '');
    }
  }, [entry]);

  if (!entry) return null;

  const handleSave = () => {
    onSave(entry.id, {
      category,
      date        : exDate,
      start       : useTime && start ? start : '',
      end         : useTime && end   ? end   : '',
      note        : note.trim() || null,
      requestLabel: `Exception — ${category}`,
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Archive exception',
      'This exception will be archived and removed from the day view. It is not permanently deleted and remains in the ledger history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => onDelete(entry.id) },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Edit exception</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.modalScroll}>

          {/* Category */}
          <Text style={styles.fieldLabel}>What kind of exception?</Text>
          <View style={[styles.chipRow, { marginBottom: 16 }]}>
            {EXCEPTION_CATS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, { borderColor: TGColors.clay }, category === c && { backgroundColor: TGColors.clay }]}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipText, { color: category === c ? TGColors.background : TGColors.clay }]}>
                  {catLabel(c)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date — tap button to open picker */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Date</Text>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDate(true)}>
              <Text style={styles.pickerBtnText}>{exDate ? toDisplayDate(exDate) : '—'}</Text>
              <Text>📅</Text>
            </TouchableOpacity>
            {showDate && (
              <DateTimePicker
                value={(() => { try { const [y,m,d] = exDate.split('-').map(Number); return new Date(y,m-1,d); } catch { return new Date(); } })()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(e, sel) => {
                  setShowDate(false);
                  if (sel) {
                    const y = sel.getFullYear();
                    const m = String(sel.getMonth()+1).padStart(2,'0');
                    const d = String(sel.getDate()).padStart(2,'0');
                    setExDate(`${y}-${m}-${d}`);
                  }
                }}
              />
            )}
          </View>

          {/* Optional time range */}
          <TouchableOpacity
            style={styles.exceptionTimeToggle}
            onPress={() => setUseTime((v) => !v)}
          >
            <Text style={styles.exceptionTimeToggleText}>
              {useTime ? '▾  Hide time range' : '▸  Edit time range (optional)'}
            </Text>
          </TouchableOpacity>
          {useTime && (
            <View style={styles.exceptionTimeRow}>
              <View style={{ flex: 1 }}>
                <TimePickerField label="From" value={start} onChange={setStart} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <TimePickerField label="To" value={end} onChange={setEnd} />
              </View>
            </View>
          )}

          {/* Note */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              multiline
              placeholderTextColor={TGColors.muted}
              placeholder="Anything to remember…"
              value={note}
              onChangeText={setNote}
            />
          </View>

          <TouchableOpacity style={[styles.goldBtn, { backgroundColor: TGColors.clay }]} onPress={handleSave}>
            <Text style={styles.goldBtnText}>Save changes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.ghostBtn, { marginTop: 8 }]} onPress={handleDelete}>
            <Text style={[styles.ghostBtnText, { color: TGColors.clay }]}>Archive this exception</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Day Override Bar ─────────────────────────────────────────────────────────
// Shows the active override for this day and lets the user set / clear it.

function DayOverrideBar({ date, override, onSet, onClear }) {
  const [expanded, setExpanded] = useState(false);
  const [note,     setNote]     = useState('');
  const types = Object.entries(DAY_OVERRIDE_TYPES);

  const handleSelect = (type) => {
    onSet(date, type, note);
    setExpanded(false);
    setNote('');
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        style={[styles.overrideBar, override && styles.overrideBarActive]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          {override
            ? <Text style={styles.overrideBarLabel}>
                📌 {DAY_OVERRIDE_TYPES[override.type] ?? override.type}
                {override.note ? <Text style={styles.overrideBarNote}>  · {override.note}</Text> : null}
              </Text>
            : <Text style={styles.overrideBarEmpty}>Mark this day (leave, WFH, half-day…)</Text>}
        </View>
        {override
          ? <TouchableOpacity onPress={onClear} style={styles.overrideClearBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.overrideClearText}>✕ Clear</Text>
            </TouchableOpacity>
          : <Text style={styles.overrideChevron}>›</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.overridePanel}>
      <Text style={styles.overridePanelTitle}>Mark this day as…</Text>
      <View style={styles.overrideChipCol}>
        {types.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.overrideChip, override?.type === key && styles.overrideChipActive]}
            onPress={() => handleSelect(key)}
          >
            <Text style={[styles.overrideChipText, override?.type === key && styles.overrideChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.overrideNoteInput}
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={TGColors.muted}
      />
      <TouchableOpacity style={styles.overrideCancelBtn} onPress={() => { setExpanded(false); setNote(''); }}>
        <Text style={styles.overrideCancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Day Detail Screen ────────────────────────────────────────────────────────

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams();
  const router   = useRouter();
  const {
    anchorDate, customBlocks,
    getTasksForDate, createDailyTask, editDailyTask, removeDailyTask,
    toggleDailyTaskDone, toggleDailyTaskProtected,
    dayOverrides, setDayOverride, removeDayOverride,
    logEntries, editLogEntry, removeLogEntry,
  } = useTimeGuardian();

  const [blocks,     setBlocks]     = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [formModal,  setFormModal]  = useState(false);
  const [editTask,   setEditTask]   = useState(null);
  const [defaultTime,setDefaultTime]= useState('');
  const [dayNote,       setDayNote]       = useState('');
  const [noteModal,     setNoteModal]     = useState(false);
  const [noteDraft,     setNoteDraft]     = useState('');
  const [editException, setEditException] = useState(null);
  const [selectedBlock,  setSelectedBlock]  = useState(null);

  const override = dayOverrides?.[date] ?? null;

  // Exceptions logged for this specific date
  const dateExceptions = useMemo(
    () => (logEntries || []).filter((e) => e.outcome === 'exception' && e.date === date),
    [logEntries, date]
  );

  // Load blocks (async) and tasks in parallel
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        getBlocksForDate(date, customBlocks),
        getTasksForDate(date),
      ]);
      setBlocks(b);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [date, customBlocks, getTasksForDate]);

  // Sync day note from dayOverrides whenever the overrides map changes
  useEffect(() => {
    const note = dayOverrides?.[date]?.note ?? '';
    setDayNote(note);
  }, [dayOverrides, date]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadTasks = useCallback(async () => {
    const t = await getTasksForDate(date);
    setTasks(t);
  }, [date, getTasksForDate]);

  const timeline   = useMemo(() => buildDayTimeline(blocks, tasks), [blocks, tasks]);
  const unassigned = useMemo(() => getUnassignedTasks(blocks, tasks), [blocks, tasks]);

  const d        = (() => { const [y,m,day] = date.split('-').map(Number); return new Date(y,m-1,day); })();
  const dayLabel = `${DAY_LABELS_FULL[d.getDay()]}, ${toDisplayDate(date)}`;

  const handleAddTask = (time = '') => { setEditTask(null); setDefaultTime(time); setFormModal(true); };
  const handleEditTask = (task) => { setEditTask(task); setFormModal(true); };

  const handleSaveTask = async (form) => {
    if (editTask) {
      await editDailyTask(editTask.id, form);
    } else {
      await createDailyTask({ ...form, date });
    }
    setFormModal(false);
    setEditTask(null);
    await loadTasks();
  };

  const handleDelete = async (id) => {
    await removeDailyTask(id);
    await loadTasks();
  };

  const handleToggleDone = async (id, current) => {
    await toggleDailyTaskDone(id, current);
    await loadTasks();
  };

  const handleToggleProtected = async (id, current) => {
    await toggleDailyTaskProtected(id, current);
    await loadTasks();
  };

  // Open note editor — pre-fill with existing note
  const openNoteModal = () => { setNoteDraft(dayNote); setNoteModal(true); };

  // Save note via day override — type stays whatever was set (or 'custom' if none)
  const handleSaveNote = async () => {
    const type = override?.type || 'custom';
    await setDayOverride(date, type, noteDraft.trim());
    setDayNote(noteDraft.trim());
    setNoteModal(false);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={TGColors.gold} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{dayLabel}</Text>
        <TouchableOpacity onPress={() => handleAddTask()}>
          <Text style={styles.addBtn}>+ Task</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Per-day override — mark this day independently of the week plan */}
        <DayOverrideBar
          date={date}
          override={override}
          onSet={setDayOverride}
          onClear={() => removeDayOverride(date)}
        />

        {/* Day note card */}
        <TouchableOpacity
          style={[styles.noteCard, dayNote && styles.noteCardFilled]}
          onPress={openNoteModal}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.noteCardLabel}>📝 Day note</Text>
            {dayNote
              ? <Text style={styles.noteCardText} numberOfLines={3}>{dayNote}</Text>
              : <Text style={styles.noteCardEmpty}>Tap to add a note for this day…</Text>}
          </View>
          <Text style={styles.noteCardChevron}>›</Text>
        </TouchableOpacity>

        {/* Exception banner — bold, prominent, shown when this day has logged exceptions */}
        {dateExceptions.length > 0 && (
          <View style={styles.exceptionBanner}>
            <Text style={styles.exceptionBannerIcon}>🌿</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.exceptionBannerTitle}>Exception day</Text>
              {dateExceptions.map((ex, i) => (
                <View key={ex.id || i} style={styles.exceptionBannerItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exceptionBannerCat}>
                      {ex.category === 'rest' ? 'Rest / burnout'
                        : ex.category ? ex.category.charAt(0).toUpperCase() + ex.category.slice(1)
                        : 'Exception'}
                    </Text>
                    {ex.start && ex.start !== ex.end
                      ? <Text style={styles.exceptionBannerTime}>{ex.start} – {ex.end}</Text>
                      : null}
                    {ex.note
                      ? <Text style={styles.exceptionBannerNote}>{ex.note}</Text>
                      : null}
                  </View>
                  {/* Edit button */}
                  <TouchableOpacity
                    style={styles.exceptionEditBtn}
                    onPress={() => setEditException(ex)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                  >
                    <Text style={styles.exceptionEditBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.exceptionBannerSub}>Never counted against you.</Text>
            </View>
          </View>
        )}

        {timeline.map(({ block, tasks: nested }, i) => (
          <BlockSection
            key={i}
            block={block}
            tasks={nested}
            onAddTask={handleAddTask}
            onToggleDone={handleToggleDone}
            onToggleProtected={handleToggleProtected}
            onEdit={handleEditTask}
            onDelete={handleDelete}
            exceptionHint={getExceptionHintForBlock(block, dateExceptions)}
            onBlockPress={setSelectedBlock}
          />
        ))}

        {/* Unassigned tasks — outside any block */}
        {unassigned.length > 0 && (
          <View style={styles.blockSection}>
            <View style={[styles.blockHeader, { borderLeftColor: TGColors.faint }]}>
              <Text style={styles.blockLabel}>Open time</Text>
            </View>
            <View style={styles.taskList}>
              {unassigned.map((t) => (
                <TaskRow key={t.id} task={t}
                  onToggleDone={handleToggleDone}
                  onToggleProtected={handleToggleProtected}
                  onEdit={handleEditTask}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.addOutlineBtn} onPress={() => handleAddTask()}>
          <Text style={styles.addOutlineBtnText}>+ Add task anywhere in this day</Text>
        </TouchableOpacity>
      </ScrollView>

      <TaskFormModal
        visible={formModal}
        initial={editTask}
        defaultTime={defaultTime}
        onSave={handleSaveTask}
        onClose={() => { setFormModal(false); setEditTask(null); }}
      />

      {/* Block detail sheet */}
      <BlockDetailSheet block={selectedBlock} onClose={() => setSelectedBlock(null)} />

      {/* Exception edit modal */}
      <ExceptionEditModal
        visible={!!editException}
        entry={editException}
        onSave={async (id, changes) => {
          await editLogEntry(id, changes);
          setEditException(null);
        }}
        onDelete={async (id) => {
          await removeLogEntry(id);
          setEditException(null);
        }}
        onClose={() => setEditException(null)}
      />

      {/* Note editor modal */}
      <Modal visible={noteModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setNoteModal(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Day note</Text>
            <TouchableOpacity onPress={() => setNoteModal(false)}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.modalScroll}>
            <Text style={styles.fieldLabel}>{dayLabel}</Text>
            <TextInput
              style={[styles.input, { height: 180, textAlignVertical: 'top', marginTop: 8 }]}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Write anything about this day — mood, events, reflections…"
              placeholderTextColor={TGColors.muted}
              multiline
              autoFocus
            />
            <TouchableOpacity style={[styles.goldBtn, { marginTop: 16 }]} onPress={handleSaveNote}>
              <Text style={styles.goldBtnText}>Save note</Text>
            </TouchableOpacity>
            {dayNote !== '' && (
              <TouchableOpacity style={[styles.ghostBtn, { marginTop: 4 }]} onPress={async () => {
                await setDayOverride(date, override?.type || 'custom', '');
                setDayNote('');
                setNoteModal(false);
              }}>
                <Text style={[styles.ghostBtnText, { color: TGColors.clay }]}>Clear note</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container : { flex: 1, backgroundColor: TGColors.background },
  centered  : { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: TGColors.background },

  header     : { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: TGColors.line, backgroundColor: TGColors.surface },
  backBtn    : { color: TGColors.muted, fontSize: 15 },
  headerTitle: { color: TGColors.ink, fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  addBtn     : { color: TGColors.gold, fontSize: 14, fontWeight: '600' },

  scroll: { padding: 16, paddingBottom: 40 },

  // Block sections
  blockSection : { marginBottom: 12 },
  blockHeader  : { borderLeftWidth: 4, paddingLeft: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: TGColors.surface, borderRadius: 10, marginBottom: 2 },
  blockLabel   : { color: TGColors.ink, fontSize: 14, fontWeight: '600' },
  blockTime    : { color: TGColors.muted, fontSize: 11, marginTop: 2 },
  blockChevron : { color: TGColors.faint, fontSize: 16, marginLeft: 8 },
  softTag      : { backgroundColor: TGColors.surfaceRaised, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  softTagText  : { color: TGColors.faint, fontSize: 10 },

  // Block detail sheet
  blockDetailBar    : { height: 4, borderRadius: 2, marginBottom: 16 },
  blockDetailLabel  : { color: TGColors.ink, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  blockDetailTime   : { color: TGColors.muted, fontSize: 14, marginBottom: 20 },
  blockDetailRow    : { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  blockDetailMeta   : { color: TGColors.muted, fontSize: 13 },
  blockDetailValue  : { color: TGColors.ink, fontSize: 13, fontWeight: '500' },
  blockDetailHint   : { marginTop: 16, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: TGColors.goldDim },
  blockDetailHintText: { color: TGColors.gold, fontSize: 13 },

  // Task list
  taskList: { paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: TGColors.line, marginLeft: 14 },

  // Task row
  taskRow       : { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  taskRowDone   : { opacity: 0.5 },
  taskDoneBtn   : { marginRight: 10 },
  taskDoneCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: TGColors.faint, alignItems: 'center', justifyContent: 'center' },
  taskDoneCircleChecked: { backgroundColor: TGColors.sage, borderColor: TGColors.sage },
  taskDoneTick  : { color: TGColors.background, fontSize: 12, fontWeight: '700' },
  taskTitle     : { color: TGColors.ink, fontSize: 13, fontWeight: '500' },
  taskTitleDone : { textDecorationLine: 'line-through', color: TGColors.muted },
  taskMeta      : { color: TGColors.muted, fontSize: 11, marginTop: 2 },

  // Protect toggle
  protectBtn     : { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: TGColors.line, marginHorizontal: 4 },
  protectBtnOn   : { borderColor: TGColors.gold, backgroundColor: TGColors.surfaceRaised },
  protectBtnText : { fontSize: 14 },
  protectBtnTextOn: { fontSize: 14 },

  taskAction    : { padding: 6 },
  taskActionText: { color: TGColors.gold, fontSize: 12 },

  // Add task
  addTaskBtn    : { paddingVertical: 8, paddingLeft: 16 },
  addTaskBtnText: { color: TGColors.faint, fontSize: 12, fontStyle: 'italic' },

  addOutlineBtn    : { borderWidth: 1, borderColor: TGColors.goldDim, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  addOutlineBtnText: { color: TGColors.gold, fontSize: 14 },

  // Day override bar
  overrideBar       : { flexDirection: 'row', alignItems: 'center', backgroundColor: TGColors.surface, borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: TGColors.line },
  overrideBarActive : { borderColor: TGColors.gold, backgroundColor: TGColors.surfaceRaised },
  overrideBarLabel  : { color: TGColors.gold, fontSize: 13, fontWeight: '600' },
  overrideBarNote   : { color: TGColors.muted, fontWeight: '400' },
  overrideBarEmpty  : { color: TGColors.faint, fontSize: 13, fontStyle: 'italic' },
  overrideChevron   : { color: TGColors.faint, fontSize: 18 },
  overrideClearBtn  : { paddingLeft: 10 },
  overrideClearText : { color: TGColors.clay, fontSize: 12, fontWeight: '600' },
  overridePanel     : { backgroundColor: TGColors.surface, borderRadius: 10, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: TGColors.goldDim },
  overridePanelTitle: { color: TGColors.ink, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  overrideChipCol   : { gap: 8, marginBottom: 12 },
  overrideChip      : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 10, padding: 12 },
  overrideChipActive: { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  overrideChipText  : { color: TGColors.muted, fontSize: 13 },
  overrideChipTextActive: { color: TGColors.background, fontWeight: '600' },
  overrideNoteInput : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 12, color: TGColors.ink, fontSize: 13, borderWidth: 1, borderColor: TGColors.line, marginBottom: 10 },
  overrideCancelBtn : { alignItems: 'center', padding: 10 },
  overrideCancelText: { color: TGColors.muted, fontSize: 13 },

  // Modal
  modal      : { flex: 1, backgroundColor: TGColors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  modalTitle : { color: TGColors.ink, fontSize: 17, fontWeight: '700' },
  modalClose : { color: TGColors.muted, fontSize: 18 },
  modalScroll: { padding: 20, paddingBottom: 60 },

  fieldGroup : { marginBottom: 14 },
  fieldLabel : { color: TGColors.muted, fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input      : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, color: TGColors.ink, fontSize: 14, borderWidth: 1, borderColor: TGColors.line },
  pickerBtn  : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: TGColors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerBtnText: { color: TGColors.ink, fontSize: 14 },

  chipRow      : { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip         : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive   : { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  chipText     : { color: TGColors.muted, fontSize: 12 },
  chipTextActive: { color: TGColors.background, fontWeight: '600' },

  toggleRow : { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  toggleSub : { color: TGColors.faint, fontSize: 11, marginTop: 2, lineHeight: 16 },

  goldBtn    : { backgroundColor: TGColors.gold, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  goldBtnText: { color: TGColors.background, fontWeight: '700', fontSize: 15 },
  ghostBtn   : { padding: 14, alignItems: 'center' },
  ghostBtnText: { color: TGColors.muted, fontSize: 14 },

  // Exception banner (top of day)
  exceptionBanner    : { flexDirection: 'row', gap: 12, backgroundColor: '#1e1008', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: TGColors.clay },
  exceptionBannerIcon: { fontSize: 24, marginTop: 2 },
  exceptionBannerTitle: { color: TGColors.clay, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  exceptionBannerItem : { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  exceptionBannerRow  : { marginBottom: 4 },
  exceptionBannerCat  : { color: TGColors.ink, fontSize: 15, fontWeight: '800' },
  exceptionBannerTime : { color: TGColors.clay, fontSize: 12, fontWeight: '600', marginTop: 2 },
  exceptionBannerNote : { color: TGColors.muted, fontSize: 12, marginTop: 1 },
  exceptionBannerSub  : { color: TGColors.faint, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  exceptionEditBtn    : { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: TGColors.clay, marginLeft: 10, marginTop: 2 },
  exceptionEditBtnText: { color: TGColors.clay, fontSize: 12, fontWeight: '600' },

  // Exception hint inside a block header
  exceptionHint: { color: TGColors.clay, fontSize: 12, fontWeight: '700', marginTop: 5, lineHeight: 17 },
  exceptionTimeToggle    : { paddingVertical: 8, marginBottom: 8 },
  exceptionTimeToggleText: { color: TGColors.gold, fontSize: 13, fontWeight: '500' },
  exceptionTimeRow       : { flexDirection: 'row', marginBottom: 4 },

  // Day note card
  noteCard        : { flexDirection: 'row', alignItems: 'center', backgroundColor: TGColors.surface, borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: TGColors.line },
  noteCardFilled  : { borderColor: TGColors.goldDim, backgroundColor: TGColors.surfaceRaised },
  noteCardLabel   : { color: TGColors.muted, fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  noteCardText    : { color: TGColors.ink, fontSize: 13, lineHeight: 18 },
  noteCardEmpty   : { color: TGColors.faint, fontSize: 13, fontStyle: 'italic' },
  noteCardChevron : { color: TGColors.faint, fontSize: 18, marginLeft: 8 },
});
