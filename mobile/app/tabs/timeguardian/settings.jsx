/**
 * settings.jsx — v2
 * Fixed header, versioned work hours editing with effectiveFrom date,
 * rotation defaults editor, custom blocks with edit.
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Switch, Platform, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { TGColors, DAY_LABELS_FULL } from '../../../timeguardian/theme/tokens';
import { toDisplayDate, toStorageDate, todayStr } from '../../../timeguardian/logic/dayBlocks';
import { SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS } from '../../../timeguardian/storage/repository';

const DAY_SHORT   = ['S','M','T','W','T','F','S'];
const CATEGORIES  = ['work','karmayoga','family','self','sleep'];
const BLOCK_TYPES = ['protected','soft'];

// ─── Shared components ────────────────────────────────────────────────────────

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

function DateField({ label, value, onChange }) {
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
            if (sel) {
              const y=sel.getFullYear(), m=String(sel.getMonth()+1).padStart(2,'0'), d=String(sel.getDate()).padStart(2,'0');
              onChange(`${y}-${m}-${d}`);
            }
          }} />
      )}
    </View>
  );
}

function ReasonModal({ visible, title, subtitle, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.reasonOverlay}>
        <View style={styles.reasonBox}>
          <Text style={styles.reasonTitle}>{title}</Text>
          {subtitle ? <Text style={styles.reasonSub}>{subtitle}</Text> : null}
          <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top', marginTop: 10 }]}
            placeholder="Why is this changing?" placeholderTextColor={TGColors.muted}
            value={reason} onChangeText={setReason} multiline />
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]}
              onPress={() => {
                if (!reason.trim()) { Alert.alert('Reason required'); return; }
                onConfirm(reason); setReason('');
              }}>
              <Text style={styles.goldBtnText}>Confirm</Text>
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

// ─── Anchor Section ───────────────────────────────────────────────────────────

function AnchorSection({ anchorDate, onSave }) {
  const [show,      setShow]      = useState(false);
  const [pending,   setPending]   = useState(null);
  const [reasonVis, setReasonVis] = useState(false);

  const dateObj = anchorDate ? (() => { const [y,m,d] = anchorDate.split('-').map(Number); return new Date(y,m-1,d); })() : new Date();

  return (
    <>
      <SectionTitle title="Rotation Anchor" subtitle="The Sunday that anchors your week-of-month calculation. Change only when your reference shifts." />
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Current anchor</Text>
        <Text style={styles.valueText}>{anchorDate ? toDisplayDate(anchorDate) : 'Not set'}</Text>
        <TouchableOpacity style={styles.outlineBtn} onPress={() => setShow(true)}>
          <Text style={styles.outlineBtnText}>Change anchor date</Text>
        </TouchableOpacity>
        {show && (
          <DateTimePicker value={dateObj} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(e, sel) => {
              setShow(false);
              if (!sel) return;
              if (sel.getDay() !== 0) { Alert.alert('Not a Sunday'); return; }
              const y=sel.getFullYear(), m=String(sel.getMonth()+1).padStart(2,'0'), d=String(sel.getDate()).padStart(2,'0');
              setPending(`${y}-${m}-${d}`); setReasonVis(true);
            }} />
        )}
      </View>
      <ReasonModal visible={reasonVis} title="Why is the anchor changing?"
        onConfirm={(r) => { onSave(pending, r); setPending(null); setReasonVis(false); }}
        onCancel={() => { setPending(null); setReasonVis(false); }} />
    </>
  );
}

// ─── Work Hours Section ───────────────────────────────────────────────────────

function WorkHoursSection({ currentWorkHours, onSave }) {
  const [editing,       setEditing]       = useState(false);
  const [form,          setForm]          = useState({ ...currentWorkHours });
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [reasonVis,     setReasonVis]     = useState(false);
  const setF = (k,v) => setForm((p) => ({ ...p, [k]: v }));
  const today = todayStr();
  const isPast = effectiveFrom < today;

  return (
    <>
      <SectionTitle title="Work Hours"
        subtitle="Mon–Fri work block. Changes are versioned — old weeks keep their original hours." />
      <View style={styles.card}>
        {!editing ? (
          <>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Work</Text><Text style={styles.summaryValue}>{currentWorkHours.workStart} – {currentWorkHours.workEnd}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Overtime buffer</Text><Text style={styles.summaryValue}>{currentWorkHours.workEnd} – {currentWorkHours.overtimeEnd}</Text></View>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => { setForm({ ...currentWorkHours }); setEffectiveFrom(todayStr()); setEditing(true); }}>
              <Text style={styles.outlineBtnText}>Edit work hours</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TimeField label="Work starts"          value={form.workStart}   onChange={(v) => setF('workStart', v)} />
            <TimeField label="Work ends"            value={form.workEnd}     onChange={(v) => setF('workEnd', v)} />
            <TimeField label="Overtime buffer ends" value={form.overtimeEnd} onChange={(v) => setF('overtimeEnd', v)} />
            <DateField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} />
            {isPast && (
              <View style={styles.pastWarning}>
                <Text style={styles.pastWarningText}>⚠ Effective date is in the past — this is a retroactive change.</Text>
              </View>
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
      </View>
      <ReasonModal visible={reasonVis} title="Why are work hours changing?"
        subtitle={isPast ? 'This is retroactive — it will affect past weeks.' : undefined}
        onConfirm={(r) => { onSave(form, effectiveFrom, r); setReasonVis(false); setEditing(false); }}
        onCancel={() => setReasonVis(false)} />
    </>
  );
}

// ─── Rotation Defaults Section ────────────────────────────────────────────────

function RotationDefaultsSection({ currentRotationDefaults, onSave }) {
  const [editing,       setEditing]       = useState(false);
  const [form,          setForm]          = useState(currentRotationDefaults.map((s) => ({ ...s })));
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr());
  const [reasonVis,     setReasonVis]     = useState(false);
  const sundayOpts   = Object.entries(SUNDAY_TYPE_LABELS);
  const saturdayOpts = Object.entries(SATURDAY_TYPE_LABELS);
  const today = todayStr();
  const isPast = effectiveFrom < today;

  const setSlot = (weekIndex, key, val) =>
    setForm((f) => f.map((s) => s.weekIndex === weekIndex ? { ...s, [key]: val } : s));

  return (
    <>
      <SectionTitle title="Default Rotation"
        subtitle="Fallback Sunday/Saturday types for weeks without a specific plan. Second week of every month is always Satori — it cannot be changed here." />
      {!editing ? (
        <View style={styles.card}>
          {currentRotationDefaults.map((slot) => (
            <View key={slot.weekIndex} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Week {slot.weekIndex + 1}</Text>
              <Text style={styles.summaryValue}>
                {SUNDAY_TYPE_LABELS[slot.sundayType] || slot.sundayType}
                {slot.saturdayType !== 'open' ? ` · Sat: ${SATURDAY_TYPE_LABELS[slot.saturdayType]}` : ''}
              </Text>
            </View>
          ))}
          <TouchableOpacity style={styles.outlineBtn} onPress={() => { setForm(currentRotationDefaults.map((s) => ({ ...s }))); setEffectiveFrom(todayStr()); setEditing(true); }}>
            <Text style={styles.outlineBtnText}>Edit rotation defaults</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          {form.map((slot) => (
            <View key={slot.weekIndex} style={styles.slotEdit}>
              <Text style={styles.slotEditTitle}>Week {slot.weekIndex + 1}</Text>
              <Text style={styles.fieldLabel}>Sunday</Text>
              <View style={styles.chipRow}>
                {sundayOpts.map(([key, label]) => (
                  <TouchableOpacity key={key}
                    style={[styles.chip, slot.sundayType === key && styles.chipActive]}
                    onPress={() => setSlot(slot.weekIndex, 'sundayType', key)}>
                    <Text style={[styles.chipText, slot.sundayType === key && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Saturday</Text>
              <View style={styles.chipRow}>
                {saturdayOpts.map(([key, label]) => (
                  <TouchableOpacity key={key}
                    style={[styles.chip, slot.saturdayType === key && styles.chipActive]}
                    onPress={() => setSlot(slot.weekIndex, 'saturdayType', key)}>
                    <Text style={[styles.chipText, slot.saturdayType === key && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          <DateField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} />
          {isPast && (
            <View style={styles.pastWarning}>
              <Text style={styles.pastWarningText}>⚠ Effective date is in the past — retroactive change.</Text>
            </View>
          )}
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]} onPress={() => setReasonVis(true)}>
              <Text style={styles.goldBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setEditing(false)}>
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ReasonModal visible={reasonVis} title="Why are rotation defaults changing?"
        subtitle={isPast ? 'This is retroactive — it will affect past weeks.' : undefined}
        onConfirm={(r) => { onSave(form, effectiveFrom, r); setReasonVis(false); setEditing(false); }}
        onCancel={() => setReasonVis(false)} />
    </>
  );
}

// ─── Custom Blocks Section ────────────────────────────────────────────────────

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
  const setF = (k,v) => setForm((p) => ({ ...p, [k]: v }));
  const toggleDay = (d) => setF('days', form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);

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
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><TimeField label="Start" value={form.start} onChange={(v) => setF('start', v)} /></View>
        <View style={{ flex: 1 }}><TimeField label="End"   value={form.end}   onChange={(v) => setF('end', v)} /></View>
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
        <TouchableOpacity style={[styles.goldBtn, { flex: 1 }]}
          onPress={() => {
            if (!form.label.trim()) { Alert.alert('Label required'); return; }
            if (form.days.length === 0) { Alert.alert('Select at least one day'); return; }
            onSave({ ...form, days: form.days.sort() });
          }}>
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
  const [mode,         setMode]         = useState('list');
  const [editingBlock, setEditingBlock] = useState(null);
  return (
    <>
      <SectionTitle title="Your Blocks" subtitle="Recurring personal commitments. Toggle to pause without deleting." />
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
        <BlockForm onSave={(b) => { onCreate(b); setMode('list'); }} onCancel={() => setMode('list')} />
      )}
      {mode === 'edit' && editingBlock && (
        <BlockForm initial={editingBlock}
          onSave={(ch) => { onEdit(editingBlock.id, ch); setMode('list'); setEditingBlock(null); }}
          onCancel={() => { setMode('list'); setEditingBlock(null); }} />
      )}
    </>
  );
}

// ─── Reminders Section ───────────────────────────────────────────────────────

const LEAD_OPTIONS = [
  { label: '5 min',  value: 5  },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
];

function RemindersSection({ notifPrefs, onUpdate, onRequestPermission }) {
  const enabled     = notifPrefs?.enabled      ?? false;
  const lead        = notifPrefs?.leadMinutes || 10;  // treat 0 same as unset — default to 10
  const permStatus  = notifPrefs?.permissionStatus ?? 'undetermined';
  const denied      = permStatus === 'denied';
  const granted     = permStatus === 'granted';

  const handleToggle = async (val) => {
    if (val && !granted && permStatus !== 'dev-build-required') {
      // Ask for permission first (only when real notifications are available)
      const result = await onRequestPermission();
      if (!result.granted && result.status !== 'dev-build-required') return;
    }
    onUpdate({ enabled: val });
  };

  return (
    <>
      <SectionTitle
        title="Reminders"
        subtitle="Local notifications before your blocks and tasks start. All on-device — no backend."
      />
      <View style={styles.card}>

        {/* Global enable toggle */}
        <View style={styles.notifRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.notifLabel}>Enable reminders</Text>
            <Text style={styles.notifSub}>
              {granted ? 'Permission granted' : denied ? 'Permission denied — tap below to open settings' : 'Permission not yet requested'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: TGColors.line, true: TGColors.goldDim }}
            thumbColor={enabled ? TGColors.gold : TGColors.faint}
            disabled={denied}
          />
        </View>

        {/* Lead time picker — only shown when enabled */}
        {enabled && (
          <>
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Remind me before</Text>
            <View style={styles.chipRow}>
              {LEAD_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, lead === opt.value && styles.chipActive]}
                  onPress={() => onUpdate({ leadMinutes: opt.value })}>
                  <Text style={[styles.chipText, lead === opt.value && styles.chipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.notifHint}>
              Applied to all active blocks and tasks. Override per-item when adding or editing a task.
            </Text>
          </>
        )}

        {/* Permission denied — open system settings */}
        {denied && (
          <TouchableOpacity
            style={[styles.outlineBtn, { marginTop: 12, borderColor: TGColors.clay }]}
            onPress={() => {
              import('expo-linking').then(({ default: Linking }) => Linking.openSettings());
            }}>
            <Text style={[styles.outlineBtnText, { color: TGColors.clay }]}>
              Open system settings to grant permission
            </Text>
          </TouchableOpacity>
        )}

        {/* Request permission button — undetermined state */}
        {!granted && !denied && (
          <TouchableOpacity
            style={[styles.outlineBtn, { marginTop: 12 }]}
            onPress={onRequestPermission}>
            <Text style={styles.outlineBtnText}>Request notification permission</Text>
          </TouchableOpacity>
        )}

      </View>
    </>
  );
}

// ─── Settings Screen ──────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const {
    anchorDate, currentWorkHours, currentRotationDefaults, customBlocks,
    saveAnchorDate, updateWorkHours, updateRotationDefaults,
    createBlock, editBlock, removeBlock, toggleBlock,
    notifPrefs, updateNotifPrefs, requestPermissions,
  } = useTimeGuardian();

  const handleRequestPermission = async () => {
    const result = await requestPermissions();
    await updateNotifPrefs({ permissionStatus: result.status });
    return result;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AnchorSection anchorDate={anchorDate} onSave={saveAnchorDate} />
        <WorkHoursSection currentWorkHours={currentWorkHours} onSave={updateWorkHours} />
        <RotationDefaultsSection currentRotationDefaults={currentRotationDefaults} onSave={updateRotationDefaults} />
        <CustomBlocksSection
          customBlocks={customBlocks}
          onToggle={toggleBlock} onDelete={removeBlock}
          onCreate={createBlock} onEdit={editBlock}
        />
        <RemindersSection
          notifPrefs={notifPrefs}
          onUpdate={updateNotifPrefs}
          onRequestPermission={handleRequestPermission}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container  : { flex: 1, backgroundColor: TGColors.background },
  header     : { backgroundColor: TGColors.surface, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  headerTitle: { color: TGColors.ink, fontSize: 22, fontWeight: '700' },
  scroll     : { padding: 16, paddingBottom: 60 },

  sectionHead : { marginTop: 24, marginBottom: 10 },
  sectionTitle: { color: TGColors.ink, fontSize: 15, fontWeight: '700' },
  sectionSub  : { color: TGColors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },

  card      : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 10 },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { color: TGColors.muted, fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input     : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, color: TGColors.ink, fontSize: 14, borderWidth: 1, borderColor: TGColors.line },
  pickerBtn : { backgroundColor: TGColors.surfaceRaised, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: TGColors.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerBtnText: { color: TGColors.ink, fontSize: 14 },
  valueText : { color: TGColors.ink, fontSize: 18, fontWeight: '600', marginBottom: 12 },

  summaryRow  : { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { color: TGColors.muted, fontSize: 13 },
  summaryValue: { color: TGColors.ink, fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' },

  btnRow    : { flexDirection: 'row', gap: 10, marginTop: 14 },
  goldBtn   : { backgroundColor: TGColors.gold, borderRadius: 10, padding: 14, alignItems: 'center' },
  goldBtnText: { color: TGColors.background, fontWeight: '700', fontSize: 14 },
  outlineBtn    : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 10, padding: 14, alignItems: 'center' },
  outlineBtnText: { color: TGColors.muted, fontSize: 14 },

  pastWarning    : { backgroundColor: '#3A2010', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: TGColors.clay },
  pastWarningText: { color: TGColors.clay, fontSize: 12 },

  slotEdit     : { borderBottomWidth: 1, borderBottomColor: TGColors.line, paddingBottom: 14, marginBottom: 14 },
  slotEditTitle: { color: TGColors.gold, fontSize: 13, fontWeight: '700', marginBottom: 8 },

  chipRow      : { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 4 },
  chip         : { borderWidth: 1, borderColor: TGColors.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive   : { backgroundColor: TGColors.gold, borderColor: TGColors.gold },
  chipText     : { color: TGColors.muted, fontSize: 12 },
  chipTextActive: { color: TGColors.background, fontWeight: '600' },

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

  emptyText: { color: TGColors.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 10 },

  notifRow  : { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  notifLabel: { color: TGColors.ink, fontSize: 14, fontWeight: '500', marginBottom: 2 },
  notifSub  : { color: TGColors.muted, fontSize: 11 },
  notifHint : { color: TGColors.faint, fontSize: 11, marginTop: 10, fontStyle: 'italic' },

  reasonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  reasonBox    : { backgroundColor: TGColors.surface, borderRadius: 16, padding: 20 },
  reasonTitle  : { color: TGColors.ink, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  reasonSub    : { color: TGColors.clay, fontSize: 12, marginBottom: 4 },
});
