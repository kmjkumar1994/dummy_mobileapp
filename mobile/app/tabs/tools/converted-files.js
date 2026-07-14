import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../../components/Button';
import PlaybackBar from '../../../components/PlaybackBar';
import Colors from '../../../constants/colors';
import {
  getHistory,
  renameEntry,
  deleteEntry,
  removeRecord,
  fileExists,
} from '../../../services/conversionHistoryService';
import { useAudioPlayer } from '../../../hooks/useAudioPlayer';

// ─── pure helpers (module-level, never recreated) ─────────────────────────────

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const FORMAT_COLOR = {
  wav: Colors.info,
  mp3: Colors.success,
};

// ─── memoized sub-components ──────────────────────────────────────────────────

const ActionBtn = React.memo(function ActionBtn({ icon, label, color, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.65}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Ionicons name={icon} size={16} color={disabled ? Colors.textMuted : color} />
      <Text style={[styles.actionLabel, { color: disabled ? Colors.textMuted : color }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

const FileItem = React.memo(function FileItem({
  item,
  isMissing,
  isLast,
  player,
  onDragStart,
  onDragEnd,
  onOpen,
  onShare,
  onRename,
  onEdit,
  onDelete,
  onRemoveBroken,
}) {
  const accentColor = FORMAT_COLOR[item.format] || Colors.primary;

  return (
    <View style={[styles.item, !isLast && styles.itemBorder]}>
      <View style={[styles.itemAccent, { backgroundColor: accentColor }]} />
      <View style={styles.itemBody}>
        <View style={styles.itemRow}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.fileName}
          </Text>
          <View style={[styles.formatBadge, { borderColor: accentColor + '60' }]}>
            <Text style={[styles.formatText, { color: accentColor }]}>
              {(item.format || '').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatSize(item.size)}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{formatDate(item.createdAt)}</Text>
        </View>

        {isMissing ? (
          <TouchableOpacity
            style={styles.missingBanner}
            onPress={onRemoveBroken}
            activeOpacity={0.7}
          >
            <Ionicons name="warning-outline" size={13} color={Colors.warning} />
            <Text style={styles.missingText}>File missing — tap to remove</Text>
          </TouchableOpacity>
        ) : (
          <PlaybackBar
            player={player}
            uri={item.fileUri}
            color={accentColor}
            disabled={isMissing}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        )}

        <View style={styles.actions}>
          <ActionBtn icon="open-outline"        label="Open"   color={Colors.textSecondary} onPress={onOpen}         disabled={isMissing} />
          <ActionBtn icon="share-social-outline" label="Share"  color={Colors.textSecondary} onPress={onShare}        disabled={isMissing} />
          <ActionBtn icon="create-outline"       label="Rename" color={Colors.primary}       onPress={onRename}       disabled={isMissing} />
          <ActionBtn icon="cut-outline"          label="Edit"   color={Colors.primary}       onPress={onEdit}         disabled={isMissing} />
          <ActionBtn icon="trash-outline"        label="Delete" color={Colors.error}         onPress={onDelete} />
        </View>
      </View>
    </View>
  );
});

// ─── screen ───────────────────────────────────────────────────────────────────

export default function ConvertedFilesScreen() {
  const router = useRouter();
  const [entries, setEntries]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [missingIds, setMissingIds] = useState(new Set());

  // Rename modal
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTarget, setRenameTarget]   = useState(null);
  const [renameInput, setRenameInput]     = useState('');
  const [renameBusy, setRenameBusy]       = useState(false);
  const [renameError, setRenameError]     = useState('');

  const player = useAudioPlayer();
  // Disabled while dragging a row's scrub bar — otherwise the FlatList steals
  // the horizontal drag gesture and the slider never moves.
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // ── data loading ────────────────────────────────────────────────────────────

  const checkMissing = useCallback(async (data) => {
    const results = await Promise.all(
      data.map(async (e) => ({ id: e.id, exists: await fileExists(e.fileUri) }))
    );
    const missing = new Set(results.filter((r) => !r.exists).map((r) => r.id));
    setMissingIds(missing);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHistory();
      setEntries(data);
      // File-existence check runs after render — does not block the list appearing.
      checkMissing(data);
    } finally {
      setLoading(false);
    }
  }, [checkMissing]);

  // Reload on focus only (not on every render).
  // useFocusEffect must receive a sync callback — async functions return a
  // Promise which React Navigation treats as an accidental cleanup value and
  // emits a warning. We wrap the async loadHistory in a plain sync callback.
  useFocusEffect(
    React.useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  // ── derived data (memoized — only recalculates when entries or search changes)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) => e.fileName.toLowerCase().includes(term));
  }, [entries, search]);

  // ── stable action handlers ───────────────────────────────────────────────────
  // Each handler is stable (useCallback with no per-item deps).
  // Per-item calls are wired via closures inside renderItem / FileItem.

  const handleShare = useCallback(async (entry) => {
    try {
      const Sharing = await import('expo-sharing');
      const available = await Sharing.isAvailableAsync?.();
      if (!available) {
        Alert.alert('Sharing unavailable', 'Rebuild the app with a Dev Client to enable sharing.');
        return;
      }
      await Sharing.shareAsync(entry.fileUri);
    } catch (err) {
      Alert.alert('Share failed', err?.message || 'Could not share file.');
    }
  }, []);

  const handleOpen = useCallback((entry) => handleShare(entry), [handleShare]);

  const handleEdit = useCallback((entry) => {
    router.push({
      pathname: '/tabs/tools/audio-editor',
      params: { fileUri: entry.fileUri, fileName: entry.fileName, format: entry.format },
    });
  }, [router]);

  const openRenameModal = useCallback((entry) => {
    const ext = entry.fileName.includes('.')
      ? entry.fileName.slice(entry.fileName.lastIndexOf('.'))
      : '';
    const base = ext ? entry.fileName.slice(0, -ext.length) : entry.fileName;
    setRenameTarget(entry);
    setRenameInput(base);
    setRenameError('');
    setRenameBusy(false);
    setRenameVisible(true);
  }, []);

  const closeRenameModal = useCallback(() => {
    setRenameVisible(false);
    setRenameTarget(null);
    setRenameInput('');
    setRenameError('');
    setRenameBusy(false);
  }, []);

  const confirmRename = useCallback(async () => {
    if (!renameInput.trim()) {
      setRenameError('Name cannot be empty.');
      return;
    }
    setRenameBusy(true);
    setRenameError('');
    try {
      const updated = await renameEntry(renameTarget.id, renameInput.trim());
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      closeRenameModal();
    } catch (err) {
      setRenameError(err?.message || 'Rename failed.');
    } finally {
      setRenameBusy(false);
    }
  }, [renameInput, renameTarget, closeRenameModal]);

  const handleDelete = useCallback((entry) => {
    Alert.alert(
      'Delete file?',
      `"${entry.fileName}" will be removed from your device and history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await player.stop(entry.fileUri);
              await deleteEntry(entry.id);
              setEntries((prev) => prev.filter((e) => e.id !== entry.id));
              setMissingIds((prev) => {
                const next = new Set(prev);
                next.delete(entry.id);
                return next;
              });
            } catch (err) {
              Alert.alert('Delete failed', err?.message || 'Could not delete file.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [player.stop]);

  const handleRemoveBroken = useCallback((entry) => {
    Alert.alert(
      'Remove from history?',
      `"${entry.fileName}" is missing from disk. Remove this record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeRecord(entry.id);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
            setMissingIds((prev) => {
              const next = new Set(prev);
              next.delete(entry.id);
              return next;
            });
          },
        },
      ],
      { cancelable: true }
    );
  }, []);

  const handleClearSearch = useCallback(() => setSearch(''), []);

  const handleRenameInput = useCallback((v) => {
    setRenameInput(v);
    setRenameError('');
  }, []);

  // ── FlatList helpers ─────────────────────────────────────────────────────────

  const keyExtractor = useCallback((item) => item.id, []);

  // renderItem is stable — closures capture the stable action handlers above.
  // FileItem is React.memo so it only re-renders when its own props change.
  const renderItem = useCallback(({ item, index }) => {
    const isMissing = missingIds.has(item.id);
    const isLast = index === filtered.length - 1;
    return (
      <FileItem
        item={item}
        isMissing={isMissing}
        isLast={isLast}
        player={player}
        onDragStart={() => setScrollEnabled(false)}
        onDragEnd={() => setScrollEnabled(true)}
        onOpen={() => handleOpen(item)}
        onShare={() => handleShare(item)}
        onRename={() => openRenameModal(item)}
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item)}
        onRemoveBroken={() => handleRemoveBroken(item)}
      />
    );
  }, [
    missingIds, filtered.length, player,
    handleOpen, handleShare, openRenameModal, handleEdit, handleDelete, handleRemoveBroken,
  ]);

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search files…"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && Platform.OS !== 'ios' ? (
          <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="musical-notes-outline" size={40} color={Colors.border} />
          <Text style={styles.emptyTitle}>
            {search.trim() ? 'No results' : 'No converted files yet'}
          </Text>
          <Text style={styles.emptyHint}>
            {search.trim()
              ? 'Try a different search term.'
              : 'Convert an audio file to see it here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          scrollEnabled={scrollEnabled}
        />
      )}

      {/* Rename modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRenameModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKAV}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Rename file</Text>
              <Text style={styles.modalHint}>
                Enter a new base name.{' '}
                {renameTarget ? `Extension (.${renameTarget.format}) will be kept.` : ''}
              </Text>

              <TextInput
                style={[styles.modalInput, renameError ? styles.modalInputError : null]}
                value={renameInput}
                onChangeText={handleRenameInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!renameBusy}
                selectTextOnFocus
              />
              {renameError ? <Text style={styles.renameError}>{renameError}</Text> : null}

              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="outline" size="sm" onPress={closeRenameModal} disabled={renameBusy} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={renameBusy ? 'Saving…' : 'Save'} size="sm" onPress={confirmRename} loading={renameBusy} disabled={renameBusy} />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: 2 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },

  list: { paddingVertical: 8, paddingHorizontal: 16 },
  item: { flexDirection: 'row', paddingVertical: 14, gap: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  itemAccent: { width: 3, borderRadius: 2, flexShrink: 0, alignSelf: 'stretch' },
  itemBody: { flex: 1, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    flexShrink: 0,
  },
  formatText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  metaDot: { fontSize: 12, color: Colors.border },
  missingBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  missingText: { fontSize: 12, color: Colors.warning },
  actions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnDisabled: { opacity: 0.4 },
  actionLabel: { fontSize: 12, fontWeight: '500' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalKAV: { width: '100%' },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  modalHint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surfaceElevated,
  },
  modalInputError: { borderColor: Colors.error },
  renameError: { fontSize: 12, color: Colors.error, marginTop: -4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
