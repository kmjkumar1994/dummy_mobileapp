/**
 * ledger.jsx — v3
 * Energy summary with range picker: 7 days, 30 days, This Month, Custom from/to.
 * Per-day detail list shows each session's individual level.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { TGColors, TGOutcomeColors, TGEnergyColors, TGEnergyLabels } from '../../../timeguardian/theme/tokens';
import { toDisplayDate } from '../../../timeguardian/logic/dayBlocks';
import {
  SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS,
  SESSION_KEYS, SESSION_ICONS,
} from '../../../timeguardian/storage/repository';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function thisMonthRange() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0');
  const last = new Date(y, d.getMonth()+1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2,'0')}` };
}
function isoToDate(iso) {
  const [y,mo,day] = iso.split('-').map(Number);
  return new Date(y, mo-1, day);
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    + '  ' + d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}
function fieldLabel(f) {
  return ({ work_hours:'Work Hours', rotation_defaults:'Rotation Defaults',
    week_plan:'Week Plan', anchor_date:'Anchor Date' })[f] || f;
}
function formatOldNew(field, oldVal, newVal) {
  if (field === 'work_hours') {
    const fmt = (v) => v ? `${v.workStart}–${v.workEnd}, overtime until ${v.overtimeEnd}` : 'not set';
    return { before: fmt(oldVal), after: fmt(newVal) };
  }
  if (field === 'anchor_date')
    return { before: oldVal ? toDisplayDate(oldVal) : 'not set', after: newVal ? toDisplayDate(newVal) : 'not set' };
  if (field === 'week_plan') {
    const fmt = (v) => v
      ? `Sunday: ${SUNDAY_TYPE_LABELS[v.sundayType]||v.sundayType}, Saturday: ${SATURDAY_TYPE_LABELS[v.saturdayType]||v.saturdayType}`
      : 'default rotation';
    return { before: fmt(oldVal), after: fmt(newVal) };
  }
  if (field === 'rotation_defaults') {
    const fmt = (v) => Array.isArray(v)
      ? v.map((s) => `W${s.weekIndex}: ${SUNDAY_TYPE_LABELS[s.sundayType]||s.sundayType}`).join(', ')
      : 'unknown';
    return { before: fmt(oldVal), after: fmt(newVal) };
  }
  return {
    before: typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal ?? 'not set'),
    after:  typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? 'not set'),
  };
}

// ─── Range picker presets ─────────────────────────────────────────────────────

const PRESETS = [
  { key: '7d',    label: '7 days'     },
  { key: '30d',   label: '30 days'    },
  { key: 'month', label: 'This month' },
  { key: 'custom',label: 'Custom'     },
];

function DateField({ label, value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.dpField}>
      <Text style={styles.dpLabel}>{label}</Text>
      <TouchableOpacity style={styles.dpBtn} onPress={() => setShow(true)}>
        <Text style={styles.dpBtnText}>{toDisplayDate(value)}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(e, sel) => {
            setShow(false);
            if (sel) {
              const y = sel.getFullYear();
              const m = String(sel.getMonth()+1).padStart(2,'0');
              const d = String(sel.getDate()).padStart(2,'0');
              onChange(`${y}-${m}-${d}`);
            }
          }}
        />
      )}
    </View>
  );
}

// ─── Energy chart (horizontal scroll for large ranges) ───────────────────────

function EnergyChart({ data }) {
  if (!data || data.length === 0)
    return <Text style={styles.empty}>No check-ins in this range.</Text>;
  const MAX_H = 80;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.chart, { width: Math.max(data.length * 36, 280) }]}>
        {data.map((e, i) => {
          const raw     = e.score ?? e.level ?? 0;
          const rounded = Math.round(raw);
          const color   = TGEnergyColors[rounded] ?? TGEnergyColors[3];
          const d       = new Date(e.date + 'T00:00:00');
          const lbl     = data.length <= 7
            ? d.toLocaleDateString('en-IN', { weekday: 'short' })
            : `${d.getDate()}`;
          return (
            <View key={i} style={styles.chartCol}>
              <View style={styles.barWrap}>
                <Text style={styles.causeLabel}>{e.entryCount ? `${e.entryCount}/4` : ''}</Text>
                <View style={[styles.bar, { height: Math.max((raw/5)*MAX_H, 4), backgroundColor: color }]} />
              </View>
              <Text style={styles.barLabel}>{lbl}</Text>
              <Text style={[styles.barLevel, { color }]}>{raw.toFixed ? raw.toFixed(1) : raw}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Summary stats ────────────────────────────────────────────────────────────

function SummaryStats({ data }) {
  const s = useMemo(() => {
    if (!data || data.length === 0) return null;
    const scores = data.map((d) => d.score).filter(Boolean);
    if (!scores.length) return null;
    const avg   = scores.reduce((a, b) => a + b, 0) / scores.length;
    const best  = data.reduce((a, b) => (b.score > a.score ? b : a));
    const worst = data.reduce((a, b) => (b.score < a.score ? b : a));
    const filled = data.reduce((a, b) => a + (b.entryCount || 0), 0);
    return { avg, best, worst, filled, total: data.length * 4 };
  }, [data]);
  if (!s) return null;
  const avgColor = TGEnergyColors[Math.round(s.avg)] ?? TGEnergyColors[3];
  const fmt = (iso) => new Date(iso+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  return (
    <View style={styles.statsRow}>
      <View style={styles.statBox}>
        <Text style={[styles.statBig, { color: avgColor }]}>{s.avg.toFixed(1)}</Text>
        <Text style={styles.statSub}>Avg score</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={[styles.statBig, { color: TGEnergyColors[Math.round(s.best.score)] }]}>{s.best.score.toFixed(1)}</Text>
        <Text style={styles.statSub}>Best · {fmt(s.best.date)}</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={[styles.statBig, { color: TGEnergyColors[Math.round(s.worst.score)] }]}>{s.worst.score.toFixed(1)}</Text>
        <Text style={styles.statSub}>Worst · {fmt(s.worst.date)}</Text>
      </View>
      <View style={styles.statBox}>
        <Text style={[styles.statBig, { color: TGColors.ink }]}>{s.filled}/{s.total}</Text>
        <Text style={styles.statSub}>Sessions filled</Text>
      </View>
    </View>
  );
}

// ─── Per-day detail list ──────────────────────────────────────────────────────

function DayDetailList({ data }) {
  if (!data || data.length === 0) return null;
  const sorted = [...data].sort((a, b) => a.date > b.date ? -1 : 1);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Day by day</Text>
      {sorted.map((day) => {
        const color = TGEnergyColors[Math.round(day.score)] ?? TGEnergyColors[3];
        return (
          <View key={day.date} style={styles.dayRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayDate}>
                {new Date(day.date+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}
              </Text>
              <View style={styles.daySessionsRow}>
                {SESSION_KEYS.map((s) => {
                  const e = day.sessions?.[s];
                  return (
                    <Text key={s} style={[styles.daySession, e && { color: TGEnergyColors[e.level] }]}>
                      {SESSION_ICONS[s]}{e ? ` ${e.level}` : ' –'}
                    </Text>
                  );
                })}
              </View>
            </View>
            <View style={styles.dayScoreWrap}>
              <Text style={[styles.dayScore, { color }]}>{day.score.toFixed(1)}</Text>
              <Text style={styles.dayScoreSub}>/5</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Cause tally ─────────────────────────────────────────────────────────────

function CauseTally({ entries }) {
  const tally = useMemo(() => {
    const low = entries.filter((e) => e.level <= 2 && e.cause);
    const counts = {};
    low.forEach((e) => { counts[e.cause] = (counts[e.cause] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1]-a[1]);
  }, [entries]);
  if (tally.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>What drains you</Text>
      {tally.map(([cause, count]) => (
        <View key={cause} style={styles.tallyRow}>
          <Text style={styles.tallyCause}>{cause}</Text>
          <View style={styles.tallyTrack}>
            <View style={[styles.tallyBar, { width: `${(count/tally[0][1])*100}%` }]} />
          </View>
          <Text style={styles.tallyCount}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Log & history ────────────────────────────────────────────────────────────

function StatTile({ label, count, color }) {
  return (
    <View style={[styles.statTile, { borderTopColor: color }]}>
      <Text style={[styles.statCount, { color }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LogRow({ entry }) {
  const color = TGOutcomeColors[entry.outcome] || TGColors.muted;
  return (
    <View style={styles.logRow}>
      <View style={[styles.logDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.logLabel}>{entry.requestLabel}</Text>
        <Text style={styles.logMeta}>
          {entry.date}  ·  {entry.start}
          {entry.displaced ? `  ·  displaced: ${entry.displaced}` : ''}
          {entry.movedTo  ? `  →  ${entry.movedTo}` : ''}
        </Text>
      </View>
      <Text style={[styles.logOutcome, { color }]}>{entry.outcome}</Text>
    </View>
  );
}

function ChangeHistorySection({ log }) {
  const [expanded, setExpanded] = useState(false);
  if (log.length === 0) return null;
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.historyToggle} onPress={() => setExpanded((e) => !e)}>
        <Text style={styles.cardTitle}>Schedule Change History</Text>
        <Text style={styles.historyCount}>{log.length} change{log.length > 1 ? 's' : ''}  {expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && log.map((entry) => {
        const { before, after } = formatOldNew(entry.field, entry.oldValue, entry.newValue);
        return (
          <View key={entry.id} style={styles.historyEntry}>
            <View style={styles.historyEntryHeader}>
              <Text style={styles.historyField}>{fieldLabel(entry.field)}</Text>
              {entry.retroactive && (
                <View style={styles.retroBadge}><Text style={styles.retroBadgeText}>retroactive</Text></View>
              )}
            </View>
            <View style={styles.historyChange}>
              <View style={styles.historyChangeCol}>
                <Text style={styles.historyChangeLabel}>Before</Text>
                <Text style={styles.historyChangeBefore}>{before}</Text>
              </View>
              <Text style={styles.historyArrow}>→</Text>
              <View style={styles.historyChangeCol}>
                <Text style={styles.historyChangeLabel}>After</Text>
                <Text style={styles.historyChangeAfter}>{after}</Text>
              </View>
            </View>
            {entry.effectiveFrom && (
              <Text style={styles.historyEffective}>Effective from: {toDisplayDate(entry.effectiveFrom)}</Text>
            )}
            <Text style={styles.historyReason}>"{entry.reason}"</Text>
            <Text style={styles.historyDate}>{formatDateTime(entry.changedAt)}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LedgerScreen() {
  const { logEntries, energyEntries, dailySummaries, scheduleChangeLog } = useTimeGuardian();

  const today = todayISO();
  const [preset,     setPreset]     = useState('7d');
  const [customFrom, setCustomFrom] = useState(addDays(today, -29));
  const [customTo,   setCustomTo]   = useState(today);

  const { from, to } = useMemo(() => {
    if (preset === '7d')    return { from: addDays(today, -6),  to: today };
    if (preset === '30d')   return { from: addDays(today, -29), to: today };
    if (preset === 'month') return thisMonthRange();
    return { from: customFrom, to: customTo };
  }, [preset, customFrom, customTo, today]);

  const rangeData = useMemo(() => {
    if (!dailySummaries) return [];
    return Object.values(dailySummaries)
      .filter((d) => d.date >= from && d.date <= to)
      .sort((a, b) => a.date < b.date ? -1 : 1);
  }, [dailySummaries, from, to]);

  const logStats = useMemo(() => {
    const c = { protected: 0, yielded: 0, open: 0, exception: 0 };
    logEntries.forEach((e) => { if (c[e.outcome] !== undefined) c[e.outcome]++; });
    return c;
  }, [logEntries]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ledger</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Log outcome tiles */}
        <View style={styles.statRow}>
          <StatTile label="Protected" count={logStats.protected} color={TGColors.sage} />
          <StatTile label="Yielded"   count={logStats.yielded}   color={TGColors.clay} />
          <StatTile label="Open"      count={logStats.open}      color={TGColors.muted} />
          <StatTile label="Exception" count={logStats.exception} color={TGColors.night} />
        </View>

        {/* Energy card with range picker */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Energy overview</Text>

          {/* Preset pills */}
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.pill, preset === p.key && styles.pillActive]}
                onPress={() => setPreset(p.key)}>
                <Text style={[styles.pillText, preset === p.key && styles.pillTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom date fields */}
          {preset === 'custom' && (
            <View style={styles.customRow}>
              <DateField label="From" value={customFrom} onChange={setCustomFrom} />
              <Text style={styles.customSep}>→</Text>
              <DateField label="To"   value={customTo}   onChange={setCustomTo} />
            </View>
          )}

          <Text style={styles.rangeLabel}>
            {toDisplayDate(from)} – {toDisplayDate(to)}
            {'  ·  '}{rangeData.length} day{rangeData.length !== 1 ? 's' : ''} with data
          </Text>

          <SummaryStats data={rangeData} />
          <EnergyChart  data={rangeData} />

          <View style={styles.legend}>
            {[1,2,3,4,5].map((l) => (
              <Text key={l} style={[styles.legendItem, { color: TGEnergyColors[l] }]}>
                {l} {TGEnergyLabels[l]}
              </Text>
            ))}
          </View>
        </View>

        <DayDetailList data={rangeData} />
        <CauseTally    entries={energyEntries} />
        <ChangeHistorySection log={scheduleChangeLog} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent log</Text>
          {logEntries.length === 0
            ? <Text style={styles.empty}>No entries yet.</Text>
            : logEntries.map((e) => <LogRow key={e.id} entry={e} />)}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container  : { flex: 1, backgroundColor: TGColors.background },
  header     : { backgroundColor: TGColors.surface, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  headerTitle: { color: TGColors.ink, fontSize: 22, fontWeight: '700' },
  scroll     : { padding: 16, paddingBottom: 60 },

  statRow  : { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statTile : { flex: 1, backgroundColor: TGColors.surface, borderRadius: 10, padding: 12, borderTopWidth: 3, alignItems: 'center' },
  statCount: { fontSize: 26, fontWeight: '800', color: TGColors.ink },
  statLabel: { color: TGColors.muted, fontSize: 10, marginTop: 4, textAlign: 'center' },

  card     : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { color: TGColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },

  presetRow        : { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  pill             : { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: TGColors.surfaceRaised, borderWidth: 1, borderColor: TGColors.line },
  pillActive       : { backgroundColor: TGColors.goldDim, borderColor: TGColors.gold },
  pillText         : { color: TGColors.muted, fontSize: 12 },
  pillTextActive   : { color: TGColors.gold, fontWeight: '700' },

  customRow : { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  customSep : { color: TGColors.muted, fontSize: 16 },
  dpField   : { flex: 1 },
  dpLabel   : { color: TGColors.faint, fontSize: 10, marginBottom: 4 },
  dpBtn     : { backgroundColor: TGColors.surfaceRaised, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: TGColors.line },
  dpBtnText : { color: TGColors.ink, fontSize: 13 },

  rangeLabel: { color: TGColors.faint, fontSize: 11, marginBottom: 14 },

  statsRow  : { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox   : { flex: 1, backgroundColor: TGColors.surfaceRaised, borderRadius: 8, padding: 10, alignItems: 'center' },
  statBig   : { fontSize: 20, fontWeight: '800' },
  statSub   : { color: TGColors.muted, fontSize: 9, marginTop: 3, textAlign: 'center' },

  chart   : { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110, paddingBottom: 4 },
  chartCol: { width: 32, alignItems: 'center' },
  barWrap : { alignItems: 'center', justifyContent: 'flex-end', height: 80 },
  bar     : { width: 24, borderRadius: 4 },
  causeLabel: { color: TGColors.muted, fontSize: 7, marginBottom: 2 },
  barLabel  : { color: TGColors.muted, fontSize: 9, marginTop: 4 },
  barLevel  : { fontSize: 10, fontWeight: '600', marginTop: 2 },
  legend    : { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  legendItem: { fontSize: 11 },

  dayRow        : { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  dayDate       : { color: TGColors.ink, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  daySessionsRow: { flexDirection: 'row', gap: 10 },
  daySession    : { color: TGColors.faint, fontSize: 12 },
  dayScoreWrap  : { flexDirection: 'row', alignItems: 'baseline', marginLeft: 12 },
  dayScore      : { fontSize: 22, fontWeight: '800' },
  dayScoreSub   : { color: TGColors.muted, fontSize: 12, marginLeft: 2 },

  tallyRow  : { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tallyCause: { color: TGColors.ink, fontSize: 13, width: 80 },
  tallyTrack: { flex: 1, height: 6, backgroundColor: TGColors.surfaceRaised, borderRadius: 3, marginHorizontal: 10 },
  tallyBar  : { height: 6, borderRadius: 3, backgroundColor: TGColors.clay },
  tallyCount: { color: TGColors.muted, fontSize: 12, width: 20, textAlign: 'right' },

  logRow    : { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  logDot    : { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 10 },
  logLabel  : { color: TGColors.ink, fontSize: 14, fontWeight: '500' },
  logMeta   : { color: TGColors.muted, fontSize: 11, marginTop: 3 },
  logOutcome: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginLeft: 8 },

  historyToggle     : { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyCount      : { color: TGColors.muted, fontSize: 12 },
  historyEntry      : { borderTopWidth: 1, borderTopColor: TGColors.line, paddingTop: 14, marginTop: 14 },
  historyEntryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  historyField      : { color: TGColors.gold, fontSize: 13, fontWeight: '700' },
  retroBadge        : { backgroundColor: TGColors.clayDim, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  retroBadgeText    : { color: TGColors.clay, fontSize: 10, fontWeight: '600' },
  historyChange     : { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  historyChangeCol  : { flex: 1 },
  historyChangeLabel: { color: TGColors.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  historyChangeBefore: { color: TGColors.faint, fontSize: 12, textDecorationLine: 'line-through' },
  historyChangeAfter : { color: TGColors.ink,   fontSize: 12, fontWeight: '500' },
  historyArrow       : { color: TGColors.muted, fontSize: 16, marginTop: 16 },
  historyEffective   : { color: TGColors.muted, fontSize: 11, marginBottom: 6 },
  historyReason      : { color: TGColors.ink, fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  historyDate        : { color: TGColors.faint, fontSize: 11 },

  empty: { color: TGColors.muted, fontSize: 13, fontStyle: 'italic' },
});
