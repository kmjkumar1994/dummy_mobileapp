import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import ErrorMessage from '../../../components/ErrorMessage';
import PlaybackBar from '../../../components/PlaybackBar';
import Colors from '../../../constants/colors';
import { convertOpusToWav, convertWavToMp3, getConverterOutputDir } from '../../../services/audioConverterService';
import { saveConversion, renameEntry, deleteEntry } from '../../../services/conversionHistoryService';
import { useShareIntentContext } from '../../../context/ShareIntentContext';
import { MIME_LABELS } from '../../../types/shareIntent';
import { clearStagingFile } from '../../../services/shareIntentService';
import { useAudioPlayer } from '../../../hooks/useAudioPlayer';

// ─── constants ───────────────────────────────────────────────────────────────

const STAGE = {
  IDLE: 'idle',
  IMPORTING: 'importing',
  WAV: 'wav',
  MP3: 'mp3',
};

// Defined outside the component — never recreated on re-render.
const PHONE_OUTPUT_DIR = getConverterOutputDir();

// ─── pure helpers (module-level) ─────────────────────────────────────────────

function displayPhonePath(uri) {
  return (uri || '').replace(/^file:\/\//, '');
}

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getMimeLabel(mimeType) {
  return MIME_LABELS[mimeType?.toLowerCase()] || mimeType || 'Audio';
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function ConverterScreen() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [wavOutput, setWavOutput]       = useState(null);
  const [mp3Output, setMp3Output]       = useState(null);
  const [activeStage, setActiveStage]   = useState(STAGE.IDLE);
  const [progress, setProgress]         = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError]               = useState('');

  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameKind, setRenameKind]     = useState(null);
  const [renameInput, setRenameInput]   = useState('');
  const [renameBusy, setRenameBusy]     = useState(false);

  const isBusy  = activeStage !== STAGE.IDLE;
  const hasFile = Boolean(selectedFile?.uri);

  const router = useRouter();
  const player = useAudioPlayer();
  // Disabled while dragging an output row's scrub bar — otherwise the
  // ScrollView steals the horizontal drag gesture and the slider never moves.
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Tracks the staged URI for the current shared file so we can delete it
  // from cache/share_staging/ after conversion or when the user cancels.
  // Only populated for files that arrived via share intent (source === 'share').
  const stagedUriRef = useRef(null);

  // ── Share Intent integration ────────────────────────────────────────────────
  const {
    pendingFile,
    status: shareStatus,
    error: shareError,
    hasFile: hasSharedFile,
    markProcessed,
    clear: clearShareIntent,
  } = useShareIntentContext();

  // Import the shared file into the converter when it becomes ready.
  // We only do this once per pending file (guarded by shareStatus === 'ready').
  useEffect(() => {
    if (shareStatus !== 'ready' || !pendingFile) return;

    // Guard: don't replace a file mid-conversion
    if (isBusy) return;

    // Import: set the staged local URI as our selected file
    setSelectedFile({
      uri:      pendingFile.uri,
      name:     pendingFile.name,
      size:     pendingFile.size,
      mimeType: pendingFile.mimeType,
      source:   pendingFile.source,
    });
    // Remember the staged URI so we can clean it up after conversion or on cancel
    stagedUriRef.current = pendingFile.source === 'share' ? pendingFile.uri : null;
    resetOutputs();
    setError('');

    // Mark the intent as consumed so the context won't re-trigger
    markProcessed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareStatus, pendingFile]);

  // Show share intent errors in the screen's own error banner
  useEffect(() => {
    if (shareStatus === 'error' && shareError) {
      setError(shareError);
    }
  }, [shareStatus, shareError]);

  // ── stable derived getter ───────────────────────────────────────────────────
  const getOutputByKind = useCallback((kind) => {
    if (kind === 'wav') return wavOutput;
    if (kind === 'mp3') return mp3Output;
    return null;
  }, [wavOutput, mp3Output]);

  // ── progress bar animation ──────────────────────────────────────────────────
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const p = Math.max(0, Math.min(1, progress / 100));
    Animated.timing(progressAnim, {
      toValue: p,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [progress, progressAnim]);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const resetOutputs = useCallback(() => {
    setWavOutput(null);
    setMp3Output(null);
    setSuccessMessage('');
  }, []);

  const shareOutputFile = async (kind) => {
    const output = getOutputByKind(kind);
    if (!output) return;
    try {
      const Sharing = await import('expo-sharing');
      const isAvailable = await Sharing.isAvailableAsync?.();
      if (!isAvailable) {
        throw new Error(
          'Sharing is not available in this build. Use a Dev Client / rebuild the native app to enable file sharing.'
        );
      }
      await Sharing.shareAsync(output.uri);
    } catch (err) {
      setError(err?.message || 'Failed to share file.');
    }
  };

  const openRenameModal = (kind) => {
    const output = getOutputByKind(kind);
    if (!output || isBusy) return;
    setRenameKind(kind);
    setRenameInput(output.fileName || '');
    setRenameBusy(false);
    setRenameModalVisible(true);
    setError('');
    setSuccessMessage('');
  };

  const closeRenameModal = () => {
    setRenameModalVisible(false);
    setRenameKind(null);
    setRenameInput('');
    setRenameBusy(false);
  };

  const renameOutputFile = async () => {
    const kind   = renameKind;
    const output = getOutputByKind(kind);
    if (!output) return closeRenameModal();

    const raw = (renameInput || '').trim();
    if (!raw) { setError('Enter a new file name.'); return; }

    setRenameBusy(true);
    setError('');
    setSuccessMessage('');

    try {
      await player.stop(output.uri);

      if (output.historyId) {
        // Goes through the same function the Converted Files screen uses —
        // moves the file AND updates the stored history record in one place,
        // so this screen and Converted Files never fall out of sync.
        const updatedEntry = await renameEntry(output.historyId, raw);
        const updated = {
          ...output,
          uri: updatedEntry.fileUri,
          path: updatedEntry.fileUri,
          fileName: updatedEntry.fileName,
          size: updatedEntry.size,
        };
        if (kind === 'wav') setWavOutput(updated);
        if (kind === 'mp3') setMp3Output(updated);

        setSuccessMessage(`Renamed to ${updatedEntry.fileName}`);
        closeRenameModal();
        return;
      }

      // Fallback for outputs that somehow have no history record yet.
      const currentFileName = output.fileName || 'audio';
      const ext = currentFileName.includes('.')
        ? currentFileName.slice(currentFileName.lastIndexOf('.'))
        : '';

      let nextFileName = raw;
      if (ext) {
        const base = nextFileName.replace(new RegExp(`${ext}$`, 'i'), '');
        nextFileName = `${base}${ext}`;
      }
      nextFileName = nextFileName.replace(/[^a-zA-Z0-9._-]/g, '_');

      const dirUri  = output.uri.substring(0, output.uri.lastIndexOf('/') + 1);
      const destUri = `${dirUri}${nextFileName}`;

      const existing = await FileSystem.getInfoAsync(destUri);
      if (existing.exists) {
        await FileSystem.deleteAsync(destUri, { idempotent: true });
      }

      await FileSystem.moveAsync({ from: output.uri, to: destUri });

      const outInfo = await FileSystem.getInfoAsync(destUri);
      if (!outInfo.exists) throw new Error('Renamed file not found after move.');

      const updated = { ...output, uri: destUri, path: destUri, fileName: nextFileName, size: outInfo.size };
      if (kind === 'wav') setWavOutput(updated);
      if (kind === 'mp3') setMp3Output(updated);

      setSuccessMessage(`Renamed to ${nextFileName}`);
      closeRenameModal();
    } catch (err) {
      setError(err?.message || 'Rename failed.');
    } finally {
      setRenameBusy(false);
    }
  };

  const deleteOutputFile = (kind) => {
    const output = getOutputByKind(kind);
    if (!output || isBusy) return;

    Alert.alert(
      'Delete file?',
      `Delete ${output.fileName} from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await player.stop(output.uri);
              if (output.historyId) {
                // Removes the file AND the history record together.
                await deleteEntry(output.historyId);
              } else {
                await FileSystem.deleteAsync(output.uri, { idempotent: true });
              }
              if (kind === 'wav') setWavOutput(null);
              if (kind === 'mp3') setMp3Output(null);
              setSuccessMessage(`Deleted ${output.fileName}`);
            } catch (err) {
              setError(err?.message || 'Delete failed.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // ── file selection ──────────────────────────────────────────────────────────
  const pickOpusFile = async () => {
    if (isBusy) return;
    setError('');
    setSuccessMessage('');

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: false,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setError('Could not read the selected file.');
        return;
      }

      const name = asset.name || asset.uri.split('/').pop() || 'unknown';

      let size = asset.size;
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        if (!info.exists) {
          setError('Selected file is not accessible. Try picking it again.');
          return;
        }
        if (info.size != null) size = info.size;
      } catch {
        // URI may still work at upload time (e.g. content:// on Android)
      }

      // Clear any pending share intent when user manually picks a file
      clearShareIntent();

      setSelectedFile({
        uri:      asset.uri,
        name,
        size,
        mimeType: asset.mimeType || 'audio/opus',
        source:   'picker',
      });
      resetOutputs();
    } catch (err) {
      setError(err.message || 'Failed to pick file.');
    }
  };

  const clearSelection = () => {
    // Clean up staged file from share_staging/ if this was a shared file
    if (stagedUriRef.current) {
      clearStagingFile(stagedUriRef.current);
      stagedUriRef.current = null;
    }
    setSelectedFile(null);
    resetOutputs();
    setError('');
    setProgress(0);
    setActiveStage(STAGE.IDLE);
    clearShareIntent();
  };

  // ── conversion ──────────────────────────────────────────────────────────────
  const convertToMp3 = async (wavResult = wavOutput) => {
    if (!wavResult?.wavPath || isBusy) {
      if (!wavResult?.wavPath) setError('Convert to WAV first.');
      return;
    }

    setError('');
    setSuccessMessage('');
    setActiveStage(STAGE.MP3);
    setProgress(0);

    try {
      const result = await convertWavToMp3(wavResult, selectedFile.name, setProgress);
      setSuccessMessage(`MP3 saved · ${result.fileName} (${formatFileSize(result.size)})`);
      const historyEntry = await saveConversion({ fileName: result.fileName, fileUri: result.uri, format: 'mp3', size: result.size });
      setMp3Output({ ...result, historyId: historyEntry?.id || null });
    } catch (err) {
      setError(err.message || 'MP3 conversion failed.');
    } finally {
      setActiveStage(STAGE.IDLE);
      setProgress(0);
    }
  };

  const promptConvertToMp3 = (wavResult) => {
    Alert.alert(
      'WAV conversion complete',
      'Proceed with Convert to MP3?',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Convert to MP3', onPress: () => convertToMp3(wavResult) },
      ],
      { cancelable: true }
    );
  };

  const convertToWav = async () => {
    if (!hasFile || isBusy) return;

    setError('');
    setSuccessMessage('');
    setActiveStage(STAGE.WAV);
    setProgress(0);
    setMp3Output(null);

    try {
      // Pass the actual MIME type so the server receives the correct content-type.
      const result = await convertOpusToWav(
        selectedFile.uri,
        selectedFile.name,
        setProgress,
        selectedFile.mimeType,
      );
      setSuccessMessage(`WAV saved · ${result.fileName} (${formatFileSize(result.size)})`);
      const historyEntry = await saveConversion({ fileName: result.fileName, fileUri: result.uri, format: 'wav', size: result.size });
      setWavOutput({ ...result, historyId: historyEntry?.id || null });

      // Upload succeeded — the staged file is no longer needed. Clean it up
      // before prompting for MP3 so cache is reclaimed as early as possible.
      if (stagedUriRef.current) {
        clearStagingFile(stagedUriRef.current);
        stagedUriRef.current = null;
      }

      promptConvertToMp3(result);
    } catch (err) {
      setError(err.message || 'WAV conversion failed.');
    } finally {
      setActiveStage(STAGE.IDLE);
      setProgress(0);
    }
  };

  // ── labels ───────────────────────────────────────────────────────────────────
  const convertingLabel =
    activeStage === STAGE.WAV     ? 'Converting to WAV…' :
    activeStage === STAGE.MP3     ? 'Converting WAV → MP3…' :
    activeStage === STAGE.IMPORTING ? 'Importing shared file…' :
    null;

  const isSharedFile = selectedFile?.source === 'share';

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="musical-notes" size={26} color={Colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.pageTitle}>Audio Converter</Text>
            <Text style={styles.subtitle}>Opus · OGG · AAC · MP3 → WAV → MP3</Text>
          </View>
        </View>

        {/* ── Info banner ── */}
        <View style={styles.stepBanner}>
          <Ionicons name="phone-portrait-outline" size={18} color={Colors.info} />
          <Text style={styles.stepBannerText}>
            Server converts the file; your phone keeps the final copy in the folder below.
          </Text>
        </View>

        {/* ── Storage path card ── */}
        <Card style={styles.storageCard}>
          <View style={styles.storageHeader}>
            <Ionicons name="folder-open" size={18} color={Colors.primary} />
            <Text style={styles.storageTitle}>Saved on this phone</Text>
          </View>
          <Text style={styles.storageHint}>
            WAV and MP3 files are stored in your app private folder (use Share to send elsewhere).
          </Text>
          <View style={styles.storagePathBox}>
            <Text style={styles.storagePathLabel}>Folder path</Text>
            <Text style={styles.storagePathValue} selectable>
              {displayPhonePath(PHONE_OUTPUT_DIR)}
            </Text>
          </View>
        </Card>

        {/* ── Error banner ── */}
        <ErrorMessage message={error} />

        {/* ── Success banner ── */}
        {successMessage ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        ) : null}

        {/* ── Receiving shared file banner ── */}
        {shareStatus === 'receiving' ? (
          <View style={styles.importBanner}>
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.importBannerText}>Importing shared file…</Text>
          </View>
        ) : null}

        {/* ── Shared file origin badge ── */}
        {isSharedFile && selectedFile ? (
          <View style={styles.sharedBadge}>
            <Ionicons name="share-social-outline" size={14} color={Colors.primary} />
            <Text style={styles.sharedBadgeText}>
              Shared from another app · {getMimeLabel(selectedFile.mimeType)}
            </Text>
          </View>
        ) : null}

        {/* ── Source file card ── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Source file</Text>
          <Text style={styles.sectionHint}>
            {isSharedFile
              ? 'File received from share — ready to convert'
              : 'Select an audio file from your device'}
          </Text>

          {selectedFile ? (
            <View style={styles.fileCard}>
              <View style={styles.fileIconWrap}>
                <Ionicons
                  name={isSharedFile ? 'share-social' : 'document-text'}
                  size={22}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={2}>
                  {selectedFile.name}
                </Text>
                <Text style={styles.fileSize}>
                  {formatFileSize(selectedFile.size)}
                  {selectedFile.mimeType && selectedFile.mimeType !== 'audio/opus'
                    ? `  ·  ${getMimeLabel(selectedFile.mimeType)}`
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={clearSelection}
                style={styles.clearBtn}
                disabled={isBusy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.pickArea}
              onPress={pickOpusFile}
              activeOpacity={0.8}
              disabled={isBusy}
            >
              <Ionicons name="folder-open-outline" size={32} color={Colors.primary} />
              <Text style={styles.pickTitle}>Tap to pick audio file</Text>
              <Text style={styles.pickHint}>
                Or share a file from Files, WhatsApp, Telegram…
              </Text>
            </TouchableOpacity>
          )}

          {selectedFile ? (
            <Button
              title="Choose different file"
              onPress={pickOpusFile}
              variant="outline"
              size="sm"
              disabled={isBusy}
              style={styles.secondaryPickBtn}
            />
          ) : null}
        </Card>

        {/* ── Progress card ── */}
        {isBusy ? (
          <FadeIn>
            <Card style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.progressLabel}>{convertingLabel}</Text>
              </View>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[styles.progressFill, { transform: [{ scaleX: progressAnim }] }]}
                />
              </View>
              <Text style={styles.progressPercent}>{progress}%</Text>
            </Card>
          </FadeIn>
        ) : null}

        {/* ── Convert buttons ── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Convert</Text>
          <Text style={styles.sectionHint}>
            WAV for KineMaster · MP3 at 192 kbps for sharing
          </Text>
          <View style={styles.actions}>
            <Button
              title="Convert to WAV"
              onPress={convertToWav}
              loading={activeStage === STAGE.WAV}
              disabled={!hasFile || isBusy}
              style={styles.actionBtn}
            />
            <Button
              title="Convert to MP3"
              onPress={() => convertToMp3()}
              variant="secondary"
              loading={activeStage === STAGE.MP3}
              disabled={!wavOutput?.wavPath || isBusy}
              style={styles.actionBtn}
            />
          </View>
        </Card>

        {/* ── Output files ── */}
        {(wavOutput || mp3Output) ? (
          <FadeIn>
            <Card style={styles.section} elevated>
              <Text style={styles.sectionTitle}>Saved files</Text>
              <Text style={styles.sectionHint}>
                Full paths on this device — use Share to export to Drive, WhatsApp, etc.
              </Text>

              {wavOutput ? (
                <OutputRow
                  icon="radio-outline"
                  label="WAV (KineMaster)"
                  fileName={wavOutput.fileName}
                  path={displayPhonePath(wavOutput.uri)}
                  color={Colors.info}
                  last={!mp3Output}
                  player={player}
                  uri={wavOutput.uri}
                  onDragStart={() => setScrollEnabled(false)}
                  onDragEnd={() => setScrollEnabled(true)}
                  onShare={() => shareOutputFile('wav')}
                  onRename={() => openRenameModal('wav')}
                  onDelete={() => deleteOutputFile('wav')}
                  actionsDisabled={isBusy}
                />
              ) : null}

              {mp3Output ? (
                <OutputRow
                  icon="musical-notes"
                  label="MP3"
                  fileName={mp3Output.fileName}
                  path={displayPhonePath(mp3Output.uri)}
                  color={Colors.success}
                  last
                  player={player}
                  uri={mp3Output.uri}
                  onDragStart={() => setScrollEnabled(false)}
                  onDragEnd={() => setScrollEnabled(true)}
                  onShare={() => shareOutputFile('mp3')}
                  onRename={() => openRenameModal('mp3')}
                  onDelete={() => deleteOutputFile('mp3')}
                  actionsDisabled={isBusy}
                />
              ) : null}
            </Card>
          </FadeIn>
        ) : null}

        {/* ── Pipeline steps ── */}
        <Card style={styles.pipelineCard}>
          <Text style={styles.pipelineTitle}>Pipeline</Text>
          <PipelineStep step="1" label="Opus / OGG / AAC → WAV" detail="Server-side FFmpeg (48 kHz)" done={Boolean(wavOutput)} />
          <PipelineStep step="2" label="WAV → MP3" detail="192 kbps" done={Boolean(mp3Output)} last />
        </Card>

        {/* ── Converted files link ── */}
        <TouchableOpacity
          style={styles.convertedFilesLink}
          onPress={() => router.push('/tabs/tools/converted-files')}
          activeOpacity={0.7}
        >
          <Ionicons name="folder-open-outline" size={16} color={Colors.primary} />
          <Text style={styles.convertedFilesLinkText}>View converted files</Text>
          <Ionicons name="chevron-forward" size={15} color={Colors.primary} />
        </TouchableOpacity>

      </ScrollView>

      {/* ── Rename modal ── */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRenameModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename file</Text>
              <Text style={styles.modalHint}>
                Enter a new name. Extension will stay {renameKind === 'wav' ? '.wav' : '.mp3'}.
              </Text>
              <TextInput
                value={renameInput}
                onChangeText={setRenameInput}
                style={styles.modalInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!renameBusy}
              />
              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="outline" size="sm" onPress={closeRenameModal} disabled={renameBusy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={renameBusy ? 'Saving...' : 'Save'} size="sm" onPress={renameOutputFile} loading={renameBusy} disabled={renameBusy} />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

const OutputRow = React.memo(function OutputRow({
  icon, label, fileName, path, color, last,
  player, uri, onDragStart, onDragEnd,
  onShare, onRename, onDelete, actionsDisabled,
}) {
  return (
    <View style={[styles.outputRow, !last && styles.outputRowBorder]}>
      <View style={styles.outputHeader}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={styles.outputLabel}>{label}</Text>
      </View>
      {fileName ? <Text style={styles.outputFileName} selectable>{fileName}</Text> : null}
      <Text style={styles.outputPathLabel}>Full path on phone</Text>
      <Text style={styles.outputPath} selectable>{path}</Text>

      <PlaybackBar
        player={player}
        uri={uri}
        color={color}
        disabled={actionsDisabled}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />

      <View style={styles.outputActions}>
        <TouchableOpacity onPress={onShare}  disabled={actionsDisabled} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="share-social-outline" size={18} color={color} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRename} disabled={actionsDisabled} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="create-outline" size={18} color={color} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} disabled={actionsDisabled} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const PipelineStep = React.memo(function PipelineStep({ step, label, detail, done, last }) {
  return (
    <View style={[styles.pipelineStep, !last && styles.pipelineStepBorder]}>
      <View style={[styles.pipelineBadge, done && styles.pipelineBadgeDone]}>
        <Text style={styles.pipelineBadgeText}>{step}</Text>
      </View>
      <View style={styles.pipelineContent}>
        <Text style={styles.pipelineLabel}>{label}</Text>
        <Text style={styles.pipelineDetail}>{detail}</Text>
      </View>
      {done
        ? <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        : <Ionicons name="ellipse-outline"  size={20} color={Colors.textMuted} />}
    </View>
  );
});

function FadeIn({ children }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: Colors.background },
  scroll:    { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 4 },

  header:        { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  headerIconWrap: { width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  headerText:    { flex: 1 },
  pageTitle:     { fontSize: 26, fontWeight: '700', color: Colors.text, letterSpacing: -0.5 },
  subtitle:      { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },

  stepBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.info + '18', borderWidth: 1, borderColor: Colors.info + '40', borderRadius: 12, padding: 12, marginBottom: 16 },
  stepBannerText: { flex: 1, fontSize: 13, color: Colors.info, lineHeight: 19 },

  importBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary + '18', borderWidth: 1, borderColor: Colors.primary + '40', borderRadius: 12, padding: 12, marginBottom: 12 },
  importBannerText: { fontSize: 13, color: Colors.primary, lineHeight: 19 },

  sharedBadge:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary + '14', borderWidth: 1, borderColor: Colors.primary + '30', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, alignSelf: 'flex-start' },
  sharedBadgeText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },

  storageCard:     { marginBottom: 16, gap: 8, backgroundColor: Colors.primary + '0D', borderWidth: 1, borderColor: Colors.primary + '33' },
  storageHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storageTitle:    { fontSize: 15, fontWeight: '600', color: Colors.text },
  storageHint:     { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  storagePathBox:  { marginTop: 4, padding: 12, borderRadius: 10, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  storagePathLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  storagePathValue: { fontSize: 12, color: Colors.text, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  successBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '40', borderRadius: 12, padding: 12, marginBottom: 16 },
  successText:   { flex: 1, fontSize: 13, color: Colors.success, lineHeight: 19 },

  section:      { marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  sectionHint:  { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },

  pickArea:  { borderWidth: 1.5, borderColor: Colors.primary + '55', borderStyle: 'dashed', borderRadius: 14, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 8, backgroundColor: Colors.primary + '0D' },
  pickTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  pickHint:  { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },

  fileCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surfaceElevated, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  fileIconWrap: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  fileMeta:    { flex: 1 },
  fileName:    { fontSize: 14, fontWeight: '600', color: Colors.text },
  fileSize:    { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  clearBtn:    { padding: 4 },
  secondaryPickBtn: { marginTop: 4 },

  progressCard:    { marginBottom: 16, gap: 12 },
  progressHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressLabel:   { fontSize: 14, fontWeight: '500', color: Colors.text },
  progressTrack:   { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill:    { width: '100%', height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  progressPercent: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right' },

  actions:   { gap: 12, marginTop: 4 },
  actionBtn: { width: '100%' },

  outputRow:       { paddingVertical: 12, gap: 6 },
  outputRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  outputHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outputLabel:     { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  outputFileName:  { fontSize: 14, fontWeight: '600', color: Colors.text, marginTop: 2 },
  outputPathLabel: { fontSize: 11, fontWeight: '600', color: Colors.textMuted, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  outputPath:      { fontSize: 12, color: Colors.text, lineHeight: 18, fontFamily: 'monospace' },
  outputActions:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  iconBtn:         { padding: 2, borderRadius: 10, backgroundColor: Colors.surfaceElevated },

  pipelineCard:       { marginTop: 4, gap: 0 },
  pipelineTitle:      { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 12 },
  pipelineStep:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  pipelineStepBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  pipelineBadge:      { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  pipelineBadgeDone:  { backgroundColor: Colors.success + '33' },
  pipelineBadgeText:  { fontSize: 12, fontWeight: '700', color: Colors.text },
  pipelineContent:    { flex: 1 },
  pipelineLabel:      { fontSize: 14, fontWeight: '600', color: Colors.text },
  pipelineDetail:     { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  convertedFilesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 10,
  },
  convertedFilesLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },

  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalKeyboard: { width: '100%' },
  modalCard:     { width: '100%', backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10 },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: Colors.text },
  modalHint:     { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  modalInput:    { borderWidth: 1.5, borderColor: Colors.primary + '55', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text, backgroundColor: Colors.surfaceElevated },
  modalActions:  { flexDirection: 'row', gap: 10, marginTop: 6 },
});
