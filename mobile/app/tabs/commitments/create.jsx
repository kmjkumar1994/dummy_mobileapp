import React, { useState } from 'react';
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

const OPTIONS = {
  status: ['tentative', 'reserved', 'confirmed', 'busy'],
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

export default function CreateCommitmentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { createCommitment, isLoading } = useCommitments();

  const [form, setForm] = useState({
    title: '',
    description: '',
    date: params.date || new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '10:00',
    status: 'confirmed',
    confidence: 100,
    category: 'work',
    priority: 'medium',
    energyCost: 'neutral',
    emotionalWeight: 'neutral',
    flexibility: 'fixed',
    recoveryNeeded: false,
    bufferBefore: 0,
    bufferAfter: 0,
    valueAlignment: 'neutral',
    notes: '',
  });

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    try {
      await createCommitment(form);
      router.back();
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not create commitment.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelBtn}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Commitment</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#6C63FF" />
          ) : (
            <Text style={styles.saveBtn}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="What is this commitment?"
            value={form.title}
            onChangeText={(v) => set('title', v)}
          />
        </View>

        {/* Date & Time */}
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={form.date}
              onChangeText={(v) => set('date', v)}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Start</Text>
            <TextInput
              style={styles.input}
              value={form.startTime}
              onChangeText={(v) => set('startTime', v)}
              placeholder="HH:MM"
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>End</Text>
            <TextInput
              style={styles.input}
              value={form.endTime}
              onChangeText={(v) => set('endTime', v)}
              placeholder="HH:MM"
            />
          </View>
        </View>

        {/* Soul Energy Fields */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Soul Energy</Text>
          <Text style={styles.sectionSub}>How does this affect you?</Text>
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

        {/* Recovery */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Recovery Needed After?</Text>
          <View style={styles.optionRow}>
            {[true, false].map((v) => (
              <TouchableOpacity
                key={String(v)}
                style={[styles.optionBtn, form.recoveryNeeded === v && styles.optionBtnActive]}
                onPress={() => set('recoveryNeeded', v)}
              >
                <Text
                  style={[
                    styles.optionText,
                    form.recoveryNeeded === v && styles.optionTextActive,
                  ]}
                >
                  {v ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Commitment Details */}
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

        {/* Buffer Times */}
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Buffer Before (min)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(form.bufferBefore)}
              onChangeText={(v) => set('bufferBefore', parseInt(v) || 0)}
            />
          </View>
          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>Buffer After (min)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(form.bufferAfter)}
              onChangeText={(v) => set('bufferAfter', parseInt(v) || 0)}
            />
          </View>
        </View>

        {/* Notes */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Private thoughts..."
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
  cancelBtn: { fontSize: 15, color: '#888' },
  saveBtn: { fontSize: 15, color: '#6C63FF', fontWeight: '700' },

  scroll: { padding: 16, paddingBottom: 60 },

  sectionHeader: { marginTop: 24, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  sectionSub: { fontSize: 12, color: '#999', marginTop: 2 },

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