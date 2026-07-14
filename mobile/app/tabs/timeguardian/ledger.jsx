/**
 * app/tabs/timeguardian/ledger.jsx
 * Ledger — 4 outcome stat tiles, 7-day energy chart, cause tally, log history.
 * The four outcome types are always rendered as separate numbers — never combined.
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTimeGuardian } from '../../../context/TimeGuardianContext';
import { TGColors, TGOutcomeColors, TGEnergyColors, TGEnergyLabels } from '../../../timeguardian/theme/tokens';

function StatTile({ label, count, color }) {
  return (
    <View style={[styles.statTile, { borderTopColor: color }]}>
      <Text style={[styles.statCount, { color }]}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EnergyChart({ data }) {
  if (!data || data.length === 0)
    return <Text style={styles.empty}>No energy check-ins yet.</Text>;

  const MAX_H = 80;
  return (
    <View style={styles.chart}>
      {data.map((e, i) => {
        const barH = (e.level / 5) * MAX_H;
        const color = TGEnergyColors[e.level];
        const label = new Date(e.date + 'T00:00:00')
          .toLocaleDateString('en-IN', { weekday: 'short' });
        return (
          <View key={i} style={styles.chartCol}>
            <View style={styles.barWrap}>
              {e.cause ? <Text style={styles.causeLabel}>{e.cause.slice(0, 3)}</Text> : null}
              <View style={[styles.bar, { height: barH, backgroundColor: color }]} />
            </View>
            <Text style={styles.barDayLabel}>{label}</Text>
            <Text style={[styles.barLevel, { color }]}>{e.level}</Text>
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
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  if (tally.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>What drains you</Text>
      {tally.map(([cause, count]) => (
        <View key={cause} style={styles.tallyRow}>
          <Text style={styles.tallyCause}>{cause}</Text>
          <View style={styles.tallyTrack}>
            <View style={[styles.tallyBar, { width: `${(count / tally[0][1]) * 100}%` }]} />
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
          {entry.date} · {entry.start}
          {entry.displaced ? `  ·  displaced: ${entry.displaced}` : ''}
          {entry.movedTo ? `  →  ${entry.movedTo}` : ''}
        </Text>
      </View>
      <Text style={[styles.logOutcome, { color }]}>{entry.outcome}</Text>
    </View>
  );
}

export default function LedgerScreen() {
  const { logEntries, energyEntries, energyChartData } = useTimeGuardian();

  const stats = useMemo(() => {
    const c = { protected: 0, yielded: 0, open: 0, exception: 0 };
    logEntries.forEach((e) => { if (c[e.outcome] !== undefined) c[e.outcome]++; });
    return c;
  }, [logEntries]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.pageTitle}>Ledger</Text>

      {/* 4 outcome tiles — always separate, never combined */}
      <View style={styles.statRow}>
        <StatTile label="Protected" count={stats.protected} color={TGColors.sage} />
        <StatTile label="Yielded"   count={stats.yielded}   color={TGColors.clay} />
        <StatTile label="Open"      count={stats.open}      color={TGColors.muted} />
        <StatTile label="Exception" count={stats.exception} color={TGColors.night} />
      </View>

      {/* Energy chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Energy — last 7 days</Text>
        <EnergyChart data={energyChartData} />
        <View style={styles.legend}>
          {[1, 2, 3, 4, 5].map((l) => (
            <Text key={l} style={[styles.legendItem, { color: TGEnergyColors[l] }]}>
              {l} {TGEnergyLabels[l]}
            </Text>
          ))}
        </View>
      </View>

      <CauseTally entries={energyEntries} />

      {/* Log history */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent log</Text>
        {logEntries.length === 0
          ? <Text style={styles.empty}>No entries yet.</Text>
          : logEntries.map((e) => <LogRow key={e.id} entry={e} />)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TGColors.background },
  scroll   : { padding: 16, paddingBottom: 60 },
  pageTitle: { color: TGColors.ink, fontSize: 26, fontWeight: '700', marginBottom: 20 },

  statRow : { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statTile: { flex: 1, backgroundColor: TGColors.surface, borderRadius: 10, padding: 12, borderTopWidth: 3, alignItems: 'center' },
  statCount: { fontSize: 26, fontWeight: '800' },
  statLabel: { color: TGColors.muted, fontSize: 10, marginTop: 4, textAlign: 'center' },

  card     : { backgroundColor: TGColors.surface, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { color: TGColors.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },

  chart   : { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 110 },
  chartCol: { flex: 1, alignItems: 'center' },
  barWrap : { alignItems: 'center', justifyContent: 'flex-end', height: 80 },
  bar     : { width: '100%', borderRadius: 4, minHeight: 4 },
  causeLabel : { color: TGColors.muted, fontSize: 8, marginBottom: 2 },
  barDayLabel: { color: TGColors.muted, fontSize: 10, marginTop: 4 },
  barLevel   : { fontSize: 11, fontWeight: '600', marginTop: 2 },

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

  empty: { color: TGColors.muted, fontSize: 13, fontStyle: 'italic' },
});
