import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCommitments } from '../../../context/CommitmentContext';
import { commitmentService } from '../../../services/commitmentService';

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

const EMOTION_ICONS = {
  joyful: '😊',
  neutral: '😐',
  stressful: '😤',
  heavy: '😔',
};

const OPTIONS = {
  status: ['free', 'tentative', 'reserved', 'confirmed', 'busy'],
  category: ['work', 'personal', 'health', 'family', 'focus', 'travel', 'social', 'other'],
  energyCost: ['restoring', 'neutral', 'draining', 'exhausting'],
  emotionalWeight: ['joyful', 'neutral', 'stressful', 'heavy'],
  flexibility: ['fixed', 'flexible', 'very-flexible'],
  valueAlignment: ['aligned', 'neutral', 'misaligned'],
};

function OptionPicker({ label, options, value, onChange }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionBtn, value === opt && styles.optionBtnActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles.optionText, value === opt && styles.optionTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoIcon}>{icon}</Text>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function CommitmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { updateCommitment, deleteCommitment } = useCommitments();

  const [commitment, setCommitment] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  const [form, setForm] = useState({});

  useEffect(() => {
    loadCommitment();
  }, [id]);

  const loadCommitment = async () => {
    try {
      setIsLoadingDetail(true);
      const data = await commitmentService.getOne(id);
      setCommitment(data.data.commitment);
      setForm(data.data.commitment);
    } catch (error) {
      Alert.alert('Error', 'Could not load commitment.');
      router.back();
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Title cannot be empty.');
      return;
    }
    setIsSaving(true);
    try {
      await updateCommitment(id, form);
      setCommitment(form);
      setIsEditing(false);
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not update commitment.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Commitment',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteCommitment(id);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Could not delete commitment.');
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (isLoadingDetail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  if (!commitment) return null;

  // ── VIEW MODE ──────────────────────────────────────────────
  if (!isEditing) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backBtn}>‹ Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsEditing(true)}>
            <Text style={styles.editBtn}>Edit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Title Block */}
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: STATUS_COLORS[commitment.status] },
                ]}
              />
              <Text style={styles.title}>{commitment.title}</Text>
            </View>
            <Text style={styles.timeText}>
              {commitment.date}  ·  {commitment.startTime} – {commitment.endTime}
            </Text>
            {commitment.description ? (
              <Text style={styles.description}>{commitment.description}</Text>
            ) : null}
          </View>

          {/* Soul Energy Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Soul Energy</Text>
            <InfoRow
              icon={ENERGY_ICONS[commitment.energyCost]}
              label="Energy Cost"
              value={commitment.energyCost}
            />
            <InfoRow
              icon={EMOTION_ICONS[commitment.emotionalWeight]}
              label="Emotional Weight"
              value={commitment.emotionalWeight}
            />
            <InfoRow
              icon={commitment.valueAlignment === 'aligned' ? '✦' : commitment.valueAlignment === 'misaligned' ? '✗' : '–'}
              label="Value Alignment"
              value={commitment.valueAlignment}
            />
            <InfoRow
              icon={commitment.recoveryNeeded ? '💤' : '✓'}
              label="Recovery Needed"
              value={commitment.recoveryNeeded ? 'Yes' : 'No'}
            />
          </View>

          {/* Details Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Details</Text>
            <InfoRow icon="📁" label="Category" value={commitment.category} />
            <InfoRow icon="🔒" label="Flexibility" value={commitment.flexibility} />
            <InfoRow icon="⏱" label="Buffer Before" value={`${commitment.bufferBefore} min`} />
            <InfoRow icon="⏱" label="Buffer After" value={`${commitment.bufferAfter} min`} />
            <InfoRow icon="📊" label="Confidence" value={`${commitment.confidence}%`} />
          </View>

          {/* Notes */}
          {commitment.notes ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notes</Text>
              <Text style={styles.notesText}>{commitment.notes}</Text>
            </View>
          ) : null}

          {/* Delete */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#F44336" />
            ) : (
              <Text style={styles.deleteBtnText}>Delete Commitment</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsEditing(false)}>
          <Text style={styles.backBtn}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Commitment</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color="#6C63FF" />
          ) : (
            <Text style={styles.editBtn}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(v) => set('title', v)}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Start</Text>
            <TextInput
              style={styles.input}
              value={form.startTime}
              onChangeText={(v) => set('startTime', v)}
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>End</Text>
            <TextInput
              style={styles.input}
              value={form.endTime}
              onChangeText={(v) => set('endTime', v)}
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Soul Energy</Text>
        </View>

        <OptionPicker
          label="Energy Cost"
          options={OPTIONS.energyCost}
          value={form.energyCost}
          onChange={(v) => set('energyCost', v)}
        />
        <OptionPicker
          label="Emotional Weight"
          options={OPTIONS.emotionalWeight}
          value={form.emotionalWeight}
          onChange={(v) => set('emotionalWeight', v)}
        />
        <OptionPicker
          label="Value Alignment"
          options={OPTIONS.valueAlignment}
          value={form.valueAlignment}
          onChange={(v) => set('valueAlignment', v)}
        />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Recovery Needed?</Text>
          <View style={styles.optionRow}>
            {[true, false].map((v) => (
              <TouchableOpacity
                key={String(v)}
                style={[styles.optionBtn, form.recoveryNeeded === v && styles.optionBtnActive]}
                onPress={() => set('recoveryNeeded', v)}
              >
                <Text
                  style={[styles.optionText, form.recoveryNeeded === v && styles.optionTextActive]}
                >
                  {v ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Details</Text>
        </View>

        <OptionPicker
          label="Status"
          options={OPTIONS.status}
          value={form.status}
          onChange={(v) => set('status', v)}
        />
        <OptionPicker
          label="Category"
          options={OPTIONS.category}
          value={form.category}
          onChange={(v) => set('category', v)}
        />
        <OptionPicker
          label="Flexibility"
          options={OPTIONS.flexibility}
          value={form.flexibility}
          onChange={(v) => set('flexibility', v)}
        />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
            numberOfLines={3}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  backBtn: { fontSize: 15, color: '#888' },
  editBtn: { fontSize: 15, color: '#6C63FF', fontWeight: '700' },

  scroll: { padding: 16, paddingBottom: 60 },

  titleBlock: { marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', flex: 1 },
  timeText: { fontSize: 13, color: '#888', marginBottom: 8 },
  description: { fontSize: 14, color: '#555', lineHeight: 20 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#999', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoIcon: { fontSize: 18, marginRight: 12, width: 24 },
  infoLabel: { fontSize: 11, color: '#999' },
  infoValue: { fontSize: 14, color: '#1A1A2E', fontWeight: '500', textTransform: 'capitalize' },

  notesText: { fontSize: 14, color: '#555', lineHeight: 20 },

  deleteBtn: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    backgroundColor: '#FFF8F8',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#F44336', fontWeight: '600', fontSize: 14 },

  sectionHeader: { marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },

  row: { flexDirection: 'row' },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A2E',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E8F0',
    backgroundColor: '#fff',
  },
  optionBtnActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  optionText: { fontSize: 12, color: '#666' },
  optionTextActive: { color: '#fff', fontWeight: '600' },
});