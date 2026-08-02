/**
 * ledger.jsx — v2
 * Fixed header (never scrolls), full detail in change history.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { TGColors, TGOutcomeColors, TGEnergyColors, TGEnergyLabels } from '../../../timeguardian/theme/tokens';
import { toDisplayDate } from '../../../timeguardian/logic/dayBlocks';
import { SUNDAY_TYPE_LABELS, SATURDAY_TYPE_LABELS } from '../../../timeguardian/storage/repository';

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    + '  ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fieldLabel(f) {
  return ({ work_hours: 'Work Hours', rotation_defaults: 'Rotation Defaults', week_plan: 'Week Plan', anchor_date: 'Anchor Date' })[f] || f;
}

function formatOldNew(field, oldVal, newVal) {
  if (field === 'work_hours') {
    const fmt = (v) => v ? `${v.workStart}–${v.workEnd}, overtime until ${v.overtimeEnd}` : 'not set';
    return { before: fmt(oldVal), after: fmt(newVal) };
  }
  if (field === 'anchor_date') {
    return { before: oldVal ? toDisplayDate(oldVal) : 'not set', after: newVal ? toDisplayDate(newVal) : 'not set' };
  }
  if (field === 'week_plan') {
    const fmt = (v) => v
      ? `Sunday: ${SUNDAY_TYPE_LABELS[v.sundayType] || v.sundayType}, Saturday: ${SATURDAY_TYPE_LABELS[v.saturdayType] || v.saturdayType}`
      : 'default rotation';
    return { before: fmt(oldVal), after: fmt(newVal) };
  }
  if (field === 'rotation_defaults') {
    const fmt = (v) => Array.isArray(v)
      ? v.map((s) => `W${s.weekIndex}: ${SUNDAY_TYPE_LABELS[s.sundayType] || s.sundayType}`).join(', ')
      : 'unknown';
    return { before: fmt(oldVal), after: fmt(newVal) };
  }
  return {
    before: typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal ?? 'not set'),
    after : typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal ?? 'not set'),
  };
}

function StatTile({ label, count, color }) {
  return (
    <View style={[styles.statTile, { borderTopColor: color }]}>
      <Text style={[styles.statCount, { color }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EnergyChart({ data }) {
  if (!data || data.length === 0) return <Text style={styles.empty}>No energy check-ins yet.</Text>;
  const MAX_H = 80;
  return (
    <View style={styles.chart}>
      {data.map((e, i) => {
        // data items are daily summaries: { date, score, entryCount, sessions }
        // fall back to e.level for legacy energyChartData items
        const rawScore = e.score ?? e.level ?? 0;
        const rounded  = Math.round(rawScore);
        const barH     = (rawScore / 5) * MAX_H;
        const color    = TGEnergyColors[rounded] ?? TGEnergyColors[3];
        const label    = new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
        return (
          <View key={i} style={styles.chartCol}>
            <View style={styles.barWrap}>
              <Text style={styles.causeLabel}>{e.entryCount ? `${e.entryCount}/4` : ''}</Text>
              <View style={[styles.bar, { height: barH, backgroundColor: color }]} />
            </View>
            <Text style={styles.barLabel}>{label}</Text>
            <Text style={[styles.barLevel, { color }]}>{rawScore.toFixed ? rawScore.toFixed(1) : rawScore}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CauseTally({ entries }) {
  const tally = useMemo(() => {
    const low = entries.filter((e) => e.level <= 2 && e.cause);
    const counts = {};
    low.forEach((e) => { counts[e.cause] = (counts[e.cause] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]);
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

export default function LedgerScreen() {
  const { logEntries, energyEntries, dailySummaries, scheduleChangeLog } = useTimeGuardian();

  const chartData = useMemo(() => {
    if (!dailySummaries) return [];
    return Object.values(dailySummaries)
      .sort((a, b) => a.date < b.date ? -1 : 1)
      .slice(-7);
  }, [dailySummaries]);

  const stats = useMemo(() => {
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
        <View style={styles.statRow}>
          <StatTile label="Protected" count={stats.protected} color={TGColors.sage} />
          <StatTile label="Yielded"   count={stats.yielded}   color={TGColors.clay} />
          <StatTile label="Open"      count={stats.open}      color={TGColors.muted} />
          <StatTile label="Exception" count={stats.exception} color={TGColors.night} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Energy — last 7 days</Text>
          <EnergyChart data={chartData} />
          <View style={styles.legend}>
            {[1,2,3,4,5].map((l) => (
              <Text key={l} style={[styles.legendItem, { color: TGEnergyColors[l] }]}>{l} {TGEnergyLabels[l]}</Text>
            ))}
          </View>
        </View>
        <CauseTally entries={energyEntries} />
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

const styles = StyleSheet.create({
  container  : { flex: 1, backgroundColor: TGColors.background },
  header     : { backgroundColor: TGColors.surface, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: TGColors.line },
  headerTitle: { color: TGColors.ink, fontSize: 22, fontWeight: '700' },
  scroll     : { padding: 16, paddingBottom: 60 },

  statRow  : { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statTile : { flex: 1, backgroundColor: TGColors.surface, borderRadius: 10, padding: 12, borderTopWidth: 3, alignItems: 'center' },
  statCount: { fontSize: 26, fontWeight: '800' },
  statLabel: { color: TGColors.muted, fontSize: 10, marginTop: 4, textAlign: 'center' },

  card     : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { color: TGColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },

  chart   : { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 110 },
  chartCol: { flex: 1, alignItems: 'center' },
  barWrap : { alignItems: 'center', justifyContent: 'flex-end', height: 80 },
  bar     : { width: '100%', borderRadius: 4, minHeight: 4 },
  causeLabel: { color: TGColors.muted, fontSize: 8, marginBottom: 2 },
  barLabel  : { color: TGColors.muted, fontSize: 10, marginTop: 4 },
  barLevel  : { fontSize: 11, fontWeight: '600', marginTop: 2 },
  legend    : { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  legendItem: { fontSize: 11 },

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
