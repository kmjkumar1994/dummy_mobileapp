/**
 * audio-editor.js
 *
 * Segment-based editor for a single converted file (WAV or MP3), reached via
 * the "Edit" button on Converted Files.
 *
 * Model: the file starts as ONE part. Play/scrub the ORIGINAL audio on the
 * single timeline below — wherever the playhead currently sits is where
 * "Split here" will cut. Each resulting part has its own volume (0-150%,
 * 0 = silent) and can be deleted (removed, closing the gap) or restored.
 *
 * There's no separate "trim" tool — trimming the start/end is just splitting
 * near that edge and deleting the small leftover piece.
 *
 * "Save" sends only the kept parts (with their volume levels) to the server,
 * which renders them into ONE new file, downloaded locally with an
 * "edited_" filename prefix and added to conversion history.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import ErrorMessage from '../../../components/ErrorMessage';
import PlaybackBar from '../../../components/PlaybackBar';
import Colors from '../../../constants/colors';
import { useAudioPlayer } from '../../../hooks/useAudioPlayer';
import { editAudioSegments } from '../../../services/audioConverterService';
import { saveConversion } from '../../../services/conversionHistoryService';

const MIN_SEGMENT_SEC = 0.5;
const EDGE_GUARD_SEC = 0.05; // how close to a boundary counts as "no real cut"

const VOICE_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'child', label: 'Child' },
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
];

let segCounter = 0;
function makeSegId() {
  segCounter += 1;
  return `seg-${Date.now()}-${segCounter}`;
}

function formatTime(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const fileUri  = params.fileUri;
  const fileName = params.fileName || 'audio';
  const format   = (params.format || '').toLowerCase() === 'mp3' ? 'mp3' : 'wav';

  const player = useAudioPlayer();

  const [duration, setDuration]     = useState(0);
  const [probing, setProbing]       = useState(true);
  const [probeError, setProbeError] = useState('');

  const [segments, setSegments]     = useState([]);

  const [voicePreset, setVoicePreset] = useState('original'); // 'original' | 'child' | 'woman' | 'man'
  const [reduceNoise, setReduceNoise] = useState(false);

  const [saving, setSaving]         = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveError, setSaveError]   = useState('');

  // Disabled while dragging the timeline slider — otherwise the ScrollView
  // steals the horizontal drag gesture and the slider never moves.
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // ── probe duration on mount ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!fileUri) {
        setProbeError('No file was passed to the editor.');
        setProbing(false);
        return;
      }
      let sound = null;
      try {
        const result = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: false });
        sound = result.sound;
        const dur = (result.status?.durationMillis || 0) / 1000;
        if (!mounted) return;
        if (!dur) {
          setProbeError('Could not read the audio duration.');
        } else {
          setDuration(dur);
          setSegments([{ id: makeSegId(), start: 0, end: dur, volume: 1, lastVolume: 1, deleted: false }]);
        }
      } catch (err) {
        if (mounted) setProbeError(err?.message || 'Could not open this audio file.');
      } finally {
        if (sound) {
          try { await sound.unloadAsync(); } catch { /* ignore */ }
        }
        if (mounted) setProbing(false);
      }
    })();
    return () => { mounted = false; };
  }, [fileUri]);

  // ── the one timeline: current playhead position on the ORIGINAL audio ──────
  // player is the same shared singleton PlaybackBar below reads from, so this
  // stays in sync with whatever the user is dragging/playing.
  const isLoadedHere = player.playingUri === fileUri;
  const currentSec = isLoadedHere ? (player.positionMillis || 0) / 1000 : 0;

  // ── derived state ────────────────────────────────────────────────────────────

  const orderedSegments = useMemo(
    () => [...segments].sort((a, b) => a.start - b.start),
    [segments]
  );

  const keptSegments = useMemo(
    () => orderedSegments.filter((s) => !s.deleted),
    [orderedSegments]
  );

  const keptDuration = useMemo(
    () => keptSegments.reduce((sum, s) => sum + (s.end - s.start), 0),
    [keptSegments]
  );

  const segmentAtPlayhead = useMemo(
    () => orderedSegments.find((s) => currentSec >= s.start && currentSec < s.end) || null,
    [orderedSegments, currentSec]
  );

  const canSplitHere = !!segmentAtPlayhead
    && !segmentAtPlayhead.deleted
    && (segmentAtPlayhead.end - segmentAtPlayhead.start) > MIN_SEGMENT_SEC * 2
    && (currentSec - segmentAtPlayhead.start) > EDGE_GUARD_SEC
    && (segmentAtPlayhead.end - currentSec) > EDGE_GUARD_SEC;

  // ── actions ──────────────────────────────────────────────────────────────────

  const handleSplitHere = useCallback(() => {
    if (!segmentAtPlayhead) {
      Alert.alert('Nothing to split', 'Play or drag the timeline to a position first.');
      return;
    }
    if (segmentAtPlayhead.deleted) {
      Alert.alert('That part is deleted', 'Restore it first if you want to split it.');
      return;
    }
    if (!canSplitHere) {
      Alert.alert('Too close to an edge', 'Move the playhead a bit further into this part.');
      return;
    }

    const point = currentSec;
    const left  = { id: makeSegId(), start: segmentAtPlayhead.start, end: point, volume: segmentAtPlayhead.volume, lastVolume: segmentAtPlayhead.lastVolume ?? 1, deleted: false };
    const right = { id: makeSegId(), start: point, end: segmentAtPlayhead.end, volume: segmentAtPlayhead.volume, lastVolume: segmentAtPlayhead.lastVolume ?? 1, deleted: false };

    setSegments((prev) => prev.flatMap((s) => (s.id === segmentAtPlayhead.id ? [left, right] : [s])));
  }, [segmentAtPlayhead, canSplitHere, currentSec]);

  const setVolume = useCallback((id, value) => {
    setSegments((prev) => prev.map((s) => (
      s.id === id ? { ...s, volume: value, lastVolume: value > 0 ? value : s.lastVolume } : s
    )));
  }, []);

  const toggleQuickMute = useCallback((id) => {
    setSegments((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      if (s.volume === 0) {
        return { ...s, volume: s.lastVolume ?? 1 };
      }
      return { ...s, volume: 0, lastVolume: s.volume };
    }));
  }, []);

  const toggleDelete = useCallback((id) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, deleted: !s.deleted } : s)));
  }, []);

  const handlePreviewSegment = useCallback((seg) => {
    player.playRange(fileUri, seg.start * 1000, seg.end * 1000);
  }, [player, fileUri]);

  const handleReset = useCallback(() => {
    if (!duration) return;
    Alert.alert('Start over?', 'This discards every split, volume change, and delete you made.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          setSegments([{ id: makeSegId(), start: 0, end: duration, volume: 1, lastVolume: 1, deleted: false }]);
        },
      },
    ]);
  }, [duration]);

  const handleSave = useCallback(async () => {
    if (keptSegments.length === 0) {
      setSaveError('Keep at least one part before saving — everything is currently deleted.');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveProgress(0);

    try {
      await player.stop(fileUri);

      const payloadSegments = keptSegments.map((s) => ({
        start: s.start,
        end: s.end,
        volume: s.volume,
      }));

      const result = await editAudioSegments(
        fileUri, fileName, format, payloadSegments,
        { voicePreset, reduceNoise },
        setSaveProgress
      );
      await saveConversion({ fileName: result.fileName, fileUri: result.uri, format, size: result.size });

      Alert.alert('Saved', `Saved as a new file: ${result.fileName}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      setSaveError(err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [keptSegments, player, fileUri, fileName, format, voicePreset, reduceNoise, router]);

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={scrollEnabled}
      >

        {/* File info */}
        <Card style={styles.section}>
          <View style={styles.fileHeader}>
            <Ionicons name="musical-notes" size={20} color={Colors.primary} />
            <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          </View>
          <Text style={styles.sectionHint}>
            {format.toUpperCase()} · {probing ? 'reading duration…' : formatTime(duration)} total
          </Text>
        </Card>

        {probing ? (
          <Card style={styles.section}>
            <View style={styles.centeredRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.sectionHint}>Reading audio…</Text>
            </View>
          </Card>
        ) : probeError ? (
          <Card style={styles.section}>
            <ErrorMessage message={probeError} />
          </Card>
        ) : (
          <>
            {/* One timeline — play, drag, and split all happen here */}
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Timeline</Text>
                <TouchableOpacity onPress={handleReset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.resetLink}>Reset all</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.sectionHint}>
                Play or drag to the spot you want, then tap Split. Tap the speed button to change playback speed.
              </Text>

              <PlaybackBar
                player={player}
                uri={fileUri}
                color={Colors.primary}
                size="large"
                showSpeed
                knownDurationMillis={duration * 1000}
                onDragStart={() => setScrollEnabled(false)}
                onDragEnd={() => setScrollEnabled(true)}
              />

              <Button
                title={`Split here (${formatTime(currentSec)})`}
                onPress={handleSplitHere}
                disabled={!canSplitHere}
                size="sm"
              />
            </Card>

            {/* Parts list */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Parts ({orderedSegments.length})</Text>
              {orderedSegments.map((seg, idx) => {
                const isAtPlayhead = segmentAtPlayhead?.id === seg.id;
                const volumePct = Math.round(seg.volume * 100);
                return (
                  <View
                    key={seg.id}
                    style={[
                      styles.segmentRow,
                      isAtPlayhead && !seg.deleted && styles.segmentRowActive,
                      seg.deleted && styles.segmentRowDeleted,
                    ]}
                  >
                    <View style={styles.segmentTopRow}>
                      <Text style={styles.segmentTitle}>
                        Part {idx + 1} · {formatTime(seg.start)} – {formatTime(seg.end)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handlePreviewSegment(seg)}
                        disabled={seg.deleted}
                        style={styles.segIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="play-circle-outline"
                          size={20}
                          color={seg.deleted ? Colors.textMuted : Colors.primary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleDelete(seg.id)}
                        style={styles.segIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={seg.deleted ? 'arrow-undo-outline' : 'trash-outline'}
                          size={18}
                          color={seg.deleted ? Colors.primary : Colors.error}
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.volumeRow}>
                      <TouchableOpacity
                        onPress={() => toggleQuickMute(seg.id)}
                        disabled={seg.deleted}
                        style={styles.muteBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name={volumePct === 0 ? 'volume-mute' : volumePct < 100 ? 'volume-low-outline' : 'volume-high-outline'}
                          size={18}
                          color={seg.deleted ? Colors.textMuted : (volumePct === 0 ? Colors.error : Colors.textSecondary)}
                        />
                      </TouchableOpacity>
                      <Slider
                        style={styles.volumeSlider}
                        minimumValue={0}
                        maximumValue={1.5}
                        step={0.05}
                        value={seg.volume}
                        minimumTrackTintColor={Colors.primary}
                        maximumTrackTintColor={Colors.border}
                        thumbTintColor={Colors.primary}
                        disabled={seg.deleted}
                        onValueChange={(v) => setVolume(seg.id, v)}
                      />
                      <Text style={styles.volumeLabel}>{volumePct}%</Text>
                    </View>
                  </View>
                );
              })}
            </Card>

            {/* Voice */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Voice</Text>
              <View style={styles.voiceRow}>
                {VOICE_OPTIONS.map((opt) => {
                  const selected = voicePreset === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setVoicePreset(opt.value)}
                      style={[styles.voiceChip, selected && styles.voiceChipSelected]}
                    >
                      <Text style={[styles.voiceChipText, selected && styles.voiceChipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.tinyHint}>
                Pitch-shifts the whole result — a fun effect, not a true voice swap. "Original" applies no change.
              </Text>
            </Card>

            {/* Noise Reduction — separate, off by default, opt-in only */}
            <Card style={styles.section}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Noise Reduction</Text>
                  <Text style={styles.tinyHint}>
                    Off by default. Turn on only if this recording has background hiss/noise.
                  </Text>
                </View>
                <Switch
                  value={reduceNoise}
                  onValueChange={setReduceNoise}
                  trackColor={{ true: Colors.primary }}
                />
              </View>
            </Card>

            {/* Save */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Save</Text>
              <Text style={styles.sectionHint}>
                Result will be {formatTime(keptDuration)} long, saved as a new "edited_" file.
              </Text>

              {saveError ? <ErrorMessage message={saveError} /> : null}

              {saving ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${saveProgress}%` }]} />
                </View>
              ) : null}

              <Button
                title={saving ? `Saving… ${saveProgress}%` : 'Save as edited copy'}
                onPress={handleSave}
                loading={saving}
                disabled={saving || keptSegments.length === 0}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },

  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sectionHint: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },

  fileHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileName: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },

  centeredRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resetLink: { fontSize: 12, fontWeight: '600', color: Colors.error },

  segmentRow: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    gap: 6,
  },
  segmentRowActive: { borderColor: Colors.primary },
  segmentRowDeleted: { opacity: 0.5, borderStyle: 'dashed' },
  segmentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segmentTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  segIconBtn: { padding: 4 },

  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muteBtn: { padding: 2 },
  volumeSlider: { flex: 1, height: 30 },
  volumeLabel: { fontSize: 11, color: Colors.textMuted, minWidth: 34, textAlign: 'right' },

  voiceRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  voiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  voiceChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  voiceChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  voiceChipTextSelected: { color: Colors.primary },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
});
