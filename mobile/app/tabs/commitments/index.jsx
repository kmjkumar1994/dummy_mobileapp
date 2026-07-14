import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCommitments } from '../../../context/CommitmentContext';

const today = () => new Date().toISOString().split('T')[0];

const STATUS_COLORS = {
  free: '#4CAF50',
  tentative: '#FF9800',
  reserved: '#2196F3',
  confirmed: '#9C27B0',
  busy: '#F44336',
};

const ENERGY_ICONS = {
  restoring: '🌿',
  neutral: '⚪',
  draining: '🔶',
  exhausting: '🔴',
};

const HEALTH_COLORS = {
  Clear: '#4CAF50',
  Healthy: '#4CAF50',
  Moderate: '#FF9800',
  Heavy: '#FF5722',
  Overloaded: '#F44336',
};

export default function CommitmentsScreen() {
  const router = useRouter();
  const { commitments, availability, isLoading, fetchCommitments, fetchAvailability } =
    useCommitments();
  const [selectedDate, setSelectedDate] = useState(today());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    await Promise.all([
      fetchCommitments({ date: selectedDate }),
      fetchAvailability(selectedDate),
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const goToYesterday = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const goToTomorrow = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const t = today();
    if (dateStr === t) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const healthColor =
    availability ? HEALTH_COLORS[availability.dayHealth?.label] || '#9E9E9E' : '#9E9E9E';

  return (
    <View style={styles.container}>
      {/* Date Navigator */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={goToYesterday} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{formatDisplayDate(selectedDate)}</Text>
        <TouchableOpacity onPress={goToTomorrow} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Day Health Card */}
        {availability && (
          <View style={[styles.healthCard, { borderLeftColor: healthColor }]}>
            <View style={styles.healthTop}>
              <Text style={styles.healthLabel}>{availability.dayHealth?.label}</Text>
              <Text style={[styles.healthScore, { color: healthColor }]}>
                {availability.dayHealth?.score}
              </Text>
            </View>
            <Text style={styles.healthMessage}>{availability.dayHealth?.message}</Text>
            <View style={styles.healthStats}>
              <Text style={styles.healthStat}>
                {availability.dayHealth?.totalCommitments} commitments
              </Text>
              <Text style={styles.healthStat}>·</Text>
              <Text style={styles.healthStat}>
                {availability.dayHealth?.drainingCount} draining
              </Text>
              <Text style={styles.healthStat}>·</Text>
              <Text style={styles.healthStat}>
                {availability.dayHealth?.availabilityPercent}% available
              </Text>
            </View>
          </View>
        )}

        {/* Commitments List */}
        {isLoading && !refreshing ? (
          <ActivityIndicator size="large" color="#6C63FF" style={styles.loader} />
        ) : commitments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✦</Text>
            <Text style={styles.emptyText}>No commitments this day</Text>
            <Text style={styles.emptySubText}>Your time is fully yours.</Text>
          </View>
        ) : (
          commitments.map((item) => (
            <TouchableOpacity
              key={item._id}
              style={styles.card}
              onPress={() => router.push(`/tabs/commitments/${item._id}`)}
            >
              <View style={styles.cardLeft}>
                <View
                  style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] }]}
                />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardTime}>
                  {item.startTime} – {item.endTime}
                </Text>
                {item.category && (
                  <Text style={styles.cardCategory}>{item.category}</Text>
                )}
              </View>
              <Text style={styles.energyIcon}>{ENERGY_ICONS[item.energyCost] || '⚪'}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push({ pathname: '/tabs/commitments/create', params: { date: selectedDate } })}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FC' },

  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 24, color: '#6C63FF' },
  dateText: { fontSize: 18, fontWeight: '600', color: '#1A1A2E' },

  scroll: { padding: 16, paddingBottom: 100 },

  healthCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  healthTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  healthLabel: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  healthScore: { fontSize: 28, fontWeight: '800' },
  healthMessage: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 10 },
  healthStats: { flexDirection: 'row', gap: 6 },
  healthStat: { fontSize: 12, color: '#999' },

  loader: { marginTop: 60 },

  empty: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 32, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1A1A2E' },
  emptySubText: { fontSize: 13, color: '#999', marginTop: 4 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardLeft: { marginRight: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  cardTime: { fontSize: 12, color: '#888', marginTop: 2 },
  cardCategory: {
    fontSize: 11,
    color: '#6C63FF',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  energyIcon: { fontSize: 18 },

  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C63FF',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  fabText: { fontSize: 28, color: '#fff', lineHeight: 32 },
});