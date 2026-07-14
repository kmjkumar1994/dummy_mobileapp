/**
 * app/tabs/timeguardian/settings.jsx
 * Settings — anchor (calendar picker + DD-MM-YYYY), work hours (with reason),
 * rotation schedule (all 4 slots visible + editable with reason),
 * custom blocks (edit inline), schedule change history.
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Switch, Platform, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { TGColors, DAY_LABELS_FULL } from '../../../timeguardian/theme/tokens';
import { toDisplayDate, toStorageDate } from '../../../timeguardian/logic/dayBlocks';

const DAY_SHORT   = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CATEGORIES  = ['work', 'karmayoga', 'family', 'self', 'sleep'];
const BLOCK_TYPES = ['protected', 'soft'];
const WEEK_LABELS = ['Week A', 'Week B', 'Week C', 'Week D'];

// ─── Reusable ─────────────────────────────────────────────────────────────────

function SectionTitle({ title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function TimeField({ label, value, onChange }) {
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
        <Text style={styles.pickerIcon}>🕐</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker value={timeObj} mode="time" is24Hour={true}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, sel) => {
            setShow(false);
            if (sel) onChange(`${String(sel.getHours()).padStart(2,'0')}:${String(sel.getMinutes()).padStart(2,'0')}`);
          }} />
      )}
    </View>
  );
}

function ReasonModal({ visible, title, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.reasonOverlay}>
        <View style={styles.reasonBox}>
          <Text style={styles.reasonTitle}>{title}</Text>
          <Text style={styles.reasonSub}>
            Changes to your schedule are logged. Write why this is changing — it helps you stay accountable to your commitments.
          </Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top', marginTop: 8 }]}
            placeholder="Why is this changing?"
            placeholderTextColor={TGColors.muted}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]}
              onPress={() => { if (!reason.trim()) { Alert.alert('Reason required', 'Please explain why this schedule is changing.'); return; } onConfirm(reason); setReason(''); }}>
              <Text style={styles.goldBtnText}>Confirm change</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => { setReason(''); onCancel(); }}>
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Section: Rotation Anchor ─────────────────────────────────────────────────

function AnchorSection({ anchorDate, onSave }) {
  const [show,       setShow]      = useState(false);
  const [pending,    setPending]   = useState(null);
  const [reasonVis,  setReasonVis] = useState(false);

  const dateObj = anchorDate
    ? (() => { const [y,m,d] = anchorDate.split('-').map(Number); return new Date(y,m-1,d); })()
    : new Date();

  const handleDateChange = (e, selected) => {
    setShow(false);
    if (!selected) return;
    if (selected.getDay() !== 0) { Alert.alert('Not a Sunday', 'Anchor must be a Sunday.'); return; }
    const y = selected.getFullYear();
    const m = String(selected.getMonth()+1).padStart(2,'0');
    const d = String(selected.getDate()).padStart(2,'0');
    setPending(`${y}-${m}-${d}`);
    setReasonVis(true);
  };

  return (
    <>
      <SectionTitle title="Rotation Anchor"
        subtitle="The single Sunday that anchors your 4-week cycle. Change only when the cycle reference shifts." />
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Current anchor</Text>
        <Text style={styles.valueText}>{anchorDate ? toDisplayDate(anchorDate) : 'Not set'}</Text>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => setShow(true)}>
          <Text style={styles.outlineBtnText}>Change anchor date</Text>
        </TouchableOpacity>
        {show && (
          <DateTimePicker value={dateObj} mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange} />
        )}
      </View>
      <ReasonModal
        visible={reasonVis}
        title="Why is the anchor date changing?"
        onConfirm={(reason) => { onSave(pending, reason); setPending(null); setReasonVis(false); }}
        onCancel={() => { setPending(null); setReasonVis(false); }}
      />
    </>
  );
}

// ─── Section: Work Hours ──────────────────────────────────────────────────────

function WorkHoursSection({ workHours, onSave }) {
  const [editing,   setEditing]   = useState(false);
  const [form,      setForm]      = useState({ ...workHours });
  const [reasonVis, setReasonVis] = useState(false);
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <>
      <SectionTitle title="Work Hours"
        subtitle="Mon–Fri work block and overtime buffer. Overtime is soft — it never justifies cutting into sleep." />
      <View style={styles.card}>
        {!editing ? (
          <>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Work</Text><Text style={styles.summaryValue}>{workHours.workStart} – {workHours.workEnd}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Overtime buffer</Text><Text style={styles.summaryValue}>{workHours.workEnd} – {workHours.overtimeEnd}</Text></View>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => { setForm({ ...workHours }); setEditing(true); }}>
              <Text style={styles.outlineBtnText}>Edit work hours</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TimeField label="Work starts" value={form.workStart} onChange={(v) => setF('workStart', v)} />
            <TimeField label="Work ends"   value={form.workEnd}   onChange={(v) => setF('workEnd', v)} />
            <TimeField label="Overtime buffer ends" value={form.overtimeEnd} onChange={(v) => setF('overtimeEnd', v)} />
            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]} onPress={() => setReasonVis(true)}>
                <Text style={styles.goldBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setEditing(false)}>
                <Text style={styles.outlineBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
      <ReasonModal
        visible={reasonVis}
        title="Why are work hours changing?"
        onConfirm={(reason) => { onSave(form, reason); setReasonVis(false); setEditing(false); }}
        onCancel={() => setReasonVis(false)}
      />
    </>
  );
}

// ─── Section: Rotation Schedule ───────────────────────────────────────────────

function RotationSlotCard({ slot, onSave }) {
  const [editing,   setEditing]   = useState(false);
  const [form,      setForm]      = useState({ ...slot });
  const [reasonVis, setReasonVis] = useState(false);
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <View style={styles.slotCard}>
      <View style={styles.slotHeader}>
        <Text style={styles.slotWeekLabel}>{WEEK_LABELS[slot.index]}</Text>
        {!editing && (
          <TouchableOpacity onPress={() => { setForm({ ...slot }); setEditing(true); }}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {!editing ? (
        <>
          <View style={styles.slotRow}>
            <Text style={styles.slotDay}>Sunday</Text>
            <Text style={styles.slotVal}>{slot.sundayLabel}</Text>
            <Text style={styles.slotTime}>{slot.sundayStart}–{slot.sundayEnd}</Text>
          </View>
          <View style={styles.slotRow}>
            <Text style={styles.slotDay}>Saturday</Text>
            {slot.hasSaturday
              ? <><Text style={styles.slotVal}>{slot.saturdayLabel}</Text><Text style={styles.slotTime}>{slot.saturdayStart}–{slot.saturdayEnd}</Text></>
              : <Text style={[styles.slotVal, { color: TGColors.faint }]}>open</Text>}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.subHead}>Sunday</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput style={styles.input} value={form.sundayLabel}
              onChangeText={(v) => setF('sundayLabel', v)} placeholderTextColor={TGColors.muted} />
          </View>
          <View style={styles.timeRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <TimeField label="Start" value={form.sundayStart} onChange={(v) => setF('sundayStart', v)} />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField label="End" value={form.sundayEnd} onChange={(v) => setF('sundayEnd', v)} />
            </View>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.fieldLabel}>Saturday also blocked?</Text>
            <Switch value={form.hasSaturday} onValueChange={(v) => setF('hasSaturday', v)}
              trackColor={{ false: TGColors.line, true: TGColors.goldDim }}
              thumbColor={form.hasSaturday ? TGColors.gold : TGColors.faint} />
          </View>

          {form.hasSaturday && (
            <>
              <Text style={styles.subHead}>Saturday</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Label</Text>
                <TextInput style={styles.input} value={form.saturdayLabel || ''}
                  onChangeText={(v) => setF('saturdayLabel', v)} placeholderTextColor={TGColors.muted} />
              </View>
              <View style={styles.timeRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <TimeField label="Start" value={form.saturdayStart || ''} onChange={(v) => setF('saturdayStart', v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <TimeField label="End" value={form.saturdayEnd || ''} onChange={(v) => setF('saturdayEnd', v)} />
                </View>
              </View>
            </>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]} onPress={() => setReasonVis(true)}>
              <Text style={styles.goldBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setEditing(false)}>
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <ReasonModal
        visible={reasonVis}
        title={`Why is ${WEEK_LABELS[slot.index]} changing?`}
        onConfirm={(reason) => { onSave(slot.index, form, reason); setReasonVis(false); setEditing(false); }}
        onCancel={() => setReasonVis(false)}
      />
    </View>
  );
}

function RotationScheduleSection({ rotationSchedule, onSaveSlot, onReset }) {
  const [resetReasonVis, setResetReasonVis] = useState(false);
  return (
    <>
      <SectionTitle title="Rotation Schedule"
        subtitle="4-week Sunday/Saturday cycle. All 4 weeks shown. Edit individually with a reason — changes are logged." />
      {rotationSchedule.map((slot) => (
        <RotationSlotCard key={slot.index} slot={slot} onSave={onSaveSlot} />
      ))}
      <TouchableOpacity style={styles.resetBtn} onPress={() => setResetReasonVis(true)}>
        <Text style={styles.resetBtnText}>Reset all to defaults</Text>
      </TouchableOpacity>
      <ReasonModal
        visible={resetReasonVis}
        title="Why are you resetting the rotation?"
        onConfirm={(reason) => { onReset(reason); setResetReasonVis(false); }}
        onCancel={() => setResetReasonVis(false)}
      />
    </>
  );
}

// ─── Section: Custom Blocks ───────────────────────────────────────────────────

function BlockCard({ block, onToggle, onDelete, onEdit }) {
  const days = block.days.map((d) => DAY_SHORT[d]).join(' ');
  return (
    <View style={styles.blockCard}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.blockLabel, !block.active && { color: TGColors.faint }]}>{block.label}</Text>
        <Text style={styles.blockMeta}>{days}  ·  {block.start}–{block.end}  ·  {block.category}  ·  {block.type}</Text>
      </View>
      <Switch value={block.active} onValueChange={() => onToggle(block.id)}
        trackColor={{ false: TGColors.line, true: TGColors.sageDim }}
        thumbColor={block.active ? TGColors.sage : TGColors.faint} />
      <TouchableOpacity style={{ marginLeft: 8, padding: 6 }} onPress={() => onEdit(block)}>
        <Text style={{ color: TGColors.gold, fontSize: 13 }}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={{ marginLeft: 6, padding: 6 }}
        onPress={() => Alert.alert('Delete block', `Remove "${block.label}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDelete(block.id) },
        ])}>
        <Text style={{ color: TGColors.clay, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function BlockForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { label: '', category: 'self', type: 'soft', days: [], start: '08:00', end: '09:00' });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleDay = (d) => setF('days', form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);

  const handleSave = () => {
    if (!form.label.trim()) { Alert.alert('Label required'); return; }
    if (form.days.length === 0) { Alert.alert('Select at least one day'); return; }
    onSave({ ...form, days: form.days.sort() });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.formTitle}>{initial ? 'Edit Block' : 'New Block'}</Text>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Label</Text>
        <TextInput style={styles.input} value={form.label} onChangeText={(v) => setF('label', v)}
          placeholderTextColor={TGColors.muted} placeholder="e.g. Evening walk" />
      </View>
      <Text style={styles.fieldLabel}>Days</Text>
      <View style={styles.dayRow}>
        {DAY_SHORT.map((d, i) => (
          <TouchableOpacity key={i} style={[styles.dayBtn, form.days.includes(i) && styles.dayBtnActive]} onPress={() => toggleDay(i)}>
            <Text style={[styles.dayBtnText, form.days.includes(i) && { color: TGColors.background }]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.timeRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <TimeField label="Start" value={form.start} onChange={(v) => setF('start', v)} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField label="End" value={form.end} onChange={(v) => setF('end', v)} />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, form.category === c && styles.chipActive]} onPress={() => setF('category', c)}>
            <Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.fieldLabel}>Type</Text>
      <View style={styles.chipRow}>
        {BLOCK_TYPES.map((t) => (
          <TouchableOpacity key={t} style={[styles.chip, form.type === t && styles.chipActive]} onPress={() => setF('type', t)}>
            <Text style={[styles.chipText, form.type === t && styles.chipTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]} onPress={handleSave}>
          <Text style={styles.goldBtnText}>Save block</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={onCancel}>
          <Text style={styles.outlineBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CustomBlocksSection({ customBlocks, onToggle, onDelete, onCreate, onEdit }) {
  const [mode,        setMode]        = useState('list'); // 'list' | 'add' | 'edit'
  const [editingBlock, setEditingBlock] = useState(null);

  return (
    <>
      <SectionTitle title="Your Blocks" subtitle="Personal recurring commitments. Toggle to pause. Edit to adjust times or days." />
      {customBlocks.length === 0 && <Text style={styles.emptyText}>No custom blocks yet.</Text>}
      {customBlocks.map((b) => (
        <BlockCard key={b.id} block={b} onToggle={onToggle} onDelete={onDelete}
          onEdit={(block) => { setEditingBlock(block); setMode('edit'); }} />
      ))}
      {mode === 'list' && (
        <TouchableOpacity style={styles.addBtn} onPress={() => setMode('add')}>
          <Text style={styles.addBtnText}>+ Add block</Text>
        </TouchableOpacity>
      )}
      {mode === 'add' && (
        <BlockForm
          onSave={(block) => { onCreate(block); setMode('list'); }}
          onCancel={() => setMode('list')}
        />
      )}
      {mode === 'edit' && editingBlock && (
        <BlockForm
          initial={editingBlock}
          onSave={(changes) => { onEdit(editingBlock.id, changes); setMode('list'); setEditingBlock(null); }}
          onCancel={() => { setMode('list'); setEditingBlock(null); }}
        />
      )}
    </>
  );
}

// ─── Section: Schedule Change History ────────────────────────────────────────

function ChangeHistorySection({ log }) {
  const [expanded, setExpanded] = useState(false);
  if (log.length === 0) return null;

  const fieldLabel = (f) => ({ work_hours: 'Work Hours', rotation_slot: 'Rotation Schedule', anchor_date: 'Anchor Date' }[f] || f);

  return (
    <>
      <SectionTitle title="Schedule Change History" subtitle="Every change you made, when, and why." />
      <TouchableOpacity style={styles.outlineBtn} onPress={() => setExpanded((e) => !e)}>
        <Text style={styles.outlineBtnText}>{expanded ? 'Hide history' : `Show history (${log.length} changes)`}</Text>
      </TouchableOpacity>
      {expanded && log.map((entry) => (
        <View key={entry.id} style={styles.logEntry}>
          <Text style={styles.logField}>{fieldLabel(entry.field)}</Text>
          <Text style={styles.logReason}>"{entry.reason}"</Text>
          <Text style={styles.logDate}>{new Date(entry.changedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </>
  );
}

// ─── Settings Screen ──────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const {
    anchorDate, workHours, rotationSchedule, scheduleChangeLog, customBlocks,
    saveAnchorDate, updateWorkHours,
    updateRotationSlotById, resetRotationSchedule,
    createBlock, editBlock, removeBlock, toggleBlock,
  } = useTimeGuardian();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <AnchorSection anchorDate={anchorDate} onSave={saveAnchorDate} />
      <WorkHoursSection workHours={workHours} onSave={updateWorkHours} />
      <RotationScheduleSection rotationSchedule={rotationSchedule} onSaveSlot={updateRotationSlotById} onReset={resetRotationSchedule} />
      <CustomBlocksSection customBlocks={customBlocks} onToggle={toggleBlock} onDelete={removeBlock} onCreate={createBlock} onEdit={editBlock} />
      <ChangeHistorySection log={scheduleChangeLog} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container : { flex: 1, backgroundColor: TGColors.background },
  scroll    : { padding: 16, paddingBottom: 60 },

  sectionHead : { marginTop: 24, marginBottom: 10 },
  sectionTitle: { color: TGColors.ink, fontSize: 15, fontWeight: '700' },
  sectionSub  : { color: TGColors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },

  card: { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 10 },

  fieldGroup  : { marginBottom: 12 },
  fieldLabel  : { color: TGColors.muted, fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input       : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, color: TGColors.ink, fontSize: 14, borderWidth: 1, borderColor: TGColors.line },
  pickerBtn   : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: TGColors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerBtnText: { color: TGColors.ink, fontSize: 14 },
  pickerIcon  : { fontSize: 18 },

  valueText   : { color: TGColors.ink, fontSize: 18, fontWeight: '600', marginBottom: 12 },
  summaryRow  : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { color: TGColors.muted, fontSize: 13 },
  summaryValue: { color: TGColors.ink, fontSize: 13, fontWeight: '500' },

  btnRow    : { flexDirection: 'row', gap: 10, marginTop: 14 },
  goldBtn   : { backgroundColor: TGColors.gold, borderRadius: 10, padding: 14, alignItems: 'center' },
  goldBtnText: { color: TGColors.background, fontWeight: '700', fontSize: 14 },
  outlineBtn    : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 10, padding: 14, alignItems: 'center' },
  outlineBtnText: { color: TGColors.muted, fontSize: 14 },

  slotCard    : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 10 },
  slotHeader  : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  slotWeekLabel: { color: TGColors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  editLink    : { color: TGColors.gold, fontSize: 13 },
  slotRow     : { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  slotDay     : { color: TGColors.muted, fontSize: 12, width: 56 },
  slotVal     : { color: TGColors.ink, fontSize: 13, fontWeight: '500', flex: 1 },
  slotTime    : { color: TGColors.muted, fontSize: 12 },
  subHead     : { color: TGColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  timeRow     : { flexDirection: 'row' },
  toggleRow   : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },

  resetBtn    : { borderWidth: 1, borderColor: TGColors.clayDim, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  resetBtnText: { color: TGColors.clay, fontSize: 13 },

  blockCard  : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  blockLabel : { color: TGColors.ink, fontSize: 14, fontWeight: '500', marginBottom: 4 },
  blockMeta  : { color: TGColors.muted, fontSize: 11 },

  addBtn    : { borderWidth: 1, borderColor: TGColors.gold, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  addBtnText: { color: TGColors.gold, fontWeight: '600', fontSize: 14 },
  formTitle : { color: TGColors.ink, fontSize: 16, fontWeight: '700', marginBottom: 8 },

  dayRow   : { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 },
  dayBtn   : { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: TGColors.line, alignItems: 'center', justifyContent: 'center' },
  dayBtnActive: { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  dayBtnText: { color: TGColors.muted, fontSize: 12, fontWeight: '500' },

  chipRow      : { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 },
  chip         : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive   : { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  chipText     : { color: TGColors.muted, fontSize: 13 },
  chipTextActive: { color: TGColors.background, fontWeight: '600' },

  emptyText: { color: TGColors.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 10 },

  reasonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  reasonBox    : { backgroundColor: TGColors.surface, borderRadius: 16, padding: 20 },
  reasonTitle  : { color: TGColors.ink, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  reasonSub    : { color: TGColors.muted, fontSize: 13, lineHeight: 20, marginBottom: 4 },

  logEntry : { backgroundColor: TGColors.surface, borderRadius: 10, padding: 14, marginBottom: 8 },
  logField : { color: TGColors.gold, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  logReason: { color: TGColors.ink, fontSize: 13, marginBottom: 6, fontStyle: 'italic' },
  logDate  : { color: TGColors.muted, fontSize: 11 },
});
