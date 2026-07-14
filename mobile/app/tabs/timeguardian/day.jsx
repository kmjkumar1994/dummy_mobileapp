/**
 * app/tabs/timeguardian/day.jsx
 * Day Detail screen — shows all blocks for a date with small tasks nested inside.
 * Tasks can be added (one-off), marked done, toggled protected.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator, Switch, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { getBlocksForDate, getDayOfWeek, toDisplayDate } from '../../../timeguardian/logic/dayBlocks';
import { TGColors, TGCategoryColors, DAY_LABELS_FULL } from '../../../timeguardian/theme/tokens';

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
  const [form, setForm] = useState(initial || { title: '', time: defaultTime || '', duration: '', category: 'work', note: '', protected: false });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (visible) setForm(initial || { title: '', time: defaultTime || '', duration: '', category: 'work', note: '', protected: false });
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

// ─── Block section with nested tasks ─────────────────────────────────────────

function BlockSection({ block, tasks, onAddTask, onToggleDone, onToggleProtected, onEdit, onDelete }) {
  const color = TGCategoryColors[block.category] || TGColors.muted;
  return (
    <View style={styles.blockSection}>
      {/* Block header */}
      <View style={[styles.blockHeader, { borderLeftColor: color }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.blockLabel}>{block.label}</Text>
          <Text style={styles.blockTime}>{block.start} – {block.end}</Text>
        </View>
        {block.type === 'soft' && <View style={styles.softTag}><Text style={styles.softTagText}>soft</Text></View>}
      </View>

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

// ─── Day Detail Screen ────────────────────────────────────────────────────────

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams();
  const router   = useRouter();
  const {
    anchorDate, customBlocks, workHours, rotationSchedule,
    getTasksForDate, createDailyTask, editDailyTask, removeDailyTask,
    toggleDailyTaskDone, toggleDailyTaskProtected,
  } = useTimeGuardian();

  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [formModal,  setFormModal]  = useState(false);
  const [editTask,   setEditTask]   = useState(null);
  const [defaultTime,setDefaultTime]= useState('');

  const blocks = anchorDate
    ? getBlocksForDate(date, anchorDate, customBlocks, workHours, rotationSchedule)
    : [];

  const loadTasks = useCallback(async () => {
    const t = await getTasksForDate(date);
    setTasks(t);
    setLoading(false);
  }, [date, getTasksForDate]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const timeline      = buildDayTimeline(blocks, tasks);
  const unassigned    = getUnassignedTasks(blocks, tasks);

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
  softTag      : { backgroundColor: TGColors.surfaceRaised, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  softTagText  : { color: TGColors.faint, fontSize: 10 },

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
});
