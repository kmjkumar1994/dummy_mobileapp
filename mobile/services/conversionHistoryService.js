/**
 * conversionHistoryService.js
 *
 * All AsyncStorage reads/writes and file-level operations for conversion
 * history are centralised here. Screens and the converter only call these
 * functions — they never touch AsyncStorage directly for history data.
 *
 * Schema for each entry:
 * {
 *   id:        string   — uuid-style unique key
 *   fileName:  string   — current file name on disk
 *   fileUri:   string   — file:// URI on device
 *   format:    string   — 'wav' | 'mp3'
 *   size:      number   — bytes (may be 0 if unknown)
 *   createdAt: string   — ISO date string
 * }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { STORAGE_KEYS } from '../constants';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONVERSION_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeAll(entries) {
  await AsyncStorage.setItem(STORAGE_KEYS.CONVERSION_HISTORY, JSON.stringify(entries));
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Save a new conversion entry.
 * Silently no-ops on error so it never breaks the converter flow.
 */
export async function saveConversion({ fileName, fileUri, format, size, source }) {
  try {
    const entries = await readAll();
    const entry = {
      id        : makeId(),
      fileName,
      fileUri,
      format    : format.toLowerCase(),
      size      : size || 0,
      createdAt : new Date().toISOString(),
      ...(source ? { source } : {}),   // 'imported' | 'converted' — omitted for converted (back-compat)
    };
    await writeAll([entry, ...entries]);
    return entry;
  } catch {
    // Never throw — history is non-critical
  }
}

/** Return all stored entries, newest first. */
export async function getHistory() {
  return readAll();
}

/**
 * Rename the physical file and update the stored entry.
 * Returns the updated entry.
 */
export async function renameEntry(id, newFileName) {
  const entries = await readAll();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('Entry not found.');

  const entry = entries[idx];

  // Derive extension from the stored fileName to ensure it stays consistent.
  const ext = entry.fileName.includes('.')
    ? entry.fileName.slice(entry.fileName.lastIndexOf('.'))
    : '';

  let nextFileName = newFileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  // Strip any trailing extension the user may have typed, then re-apply.
  if (ext) {
    nextFileName = nextFileName.replace(new RegExp(`${ext}$`, 'i'), '');
  }
  nextFileName = `${nextFileName}${ext}`;

  const dirUri = entry.fileUri.substring(0, entry.fileUri.lastIndexOf('/') + 1);
  const destUri = `${dirUri}${nextFileName}`;

  // Overwrite destination if it already exists.
  const existing = await FileSystem.getInfoAsync(destUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(destUri, { idempotent: true });
  }

  await FileSystem.moveAsync({ from: entry.fileUri, to: destUri });

  const outInfo = await FileSystem.getInfoAsync(destUri);
  if (!outInfo.exists) throw new Error('File not found after rename.');

  const updated = {
    ...entry,
    fileName: nextFileName,
    fileUri: destUri,
    size: outInfo.size ?? entry.size,
  };

  entries[idx] = updated;
  await writeAll(entries);
  return updated;
}

/**
 * Delete the physical file and remove the history entry.
 */
export async function deleteEntry(id) {
  const entries = await readAll();
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error('Entry not found.');

  await FileSystem.deleteAsync(entry.fileUri, { idempotent: true });

  await writeAll(entries.filter((e) => e.id !== id));
}

/**
 * Remove a history record without touching the file (for broken entries).
 */
export async function removeRecord(id) {
  const entries = await readAll();
  await writeAll(entries.filter((e) => e.id !== id));
}

/**
 * Check whether a stored file still exists on disk.
 */
export async function fileExists(fileUri) {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    return info.exists;
  } catch {
    return false;
  }
}

// ─── Import external audio file ───────────────────────────────────────────────

/**
 * Open the system document picker filtered to audio files, copy the selected
 * file into the app's private documents directory, and save a history record.
 *
 * Returns the new history entry, or null if the user cancelled.
 * Throws on any real error (copy failed, disk full, etc.) so the caller can
 * show an error message.
 *
 * The record is identical in shape to a converted file except for an extra
 * `source: 'imported'` field — the audio editor and all other features work
 * with it transparently.
 */
export async function importAudioFile() {
  // ── 1. Pick ────────────────────────────────────────────────────────────────
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type      : 'audio/*',
    copyToCacheDirectory: false,  // we copy to documentDirectory ourselves
  });

  // User cancelled — result.canceled is true in SDK 49+
  if (result.canceled || !result.assets?.length) return null;

  const asset    = result.assets[0];
  const sourceUri = asset.uri;
  const mimeType  = asset.mimeType || '';

  // ── 2. Derive format ───────────────────────────────────────────────────────
  // Prefer extension from the file name; fall back to MIME type.
  const rawName   = asset.name || sourceUri.split('/').pop() || 'audio';
  const extMatch  = rawName.match(/\.([a-zA-Z0-9]+)$/);
  const ext       = extMatch ? extMatch[1].toLowerCase() : (mimeType.split('/')[1] || 'audio');
  const format    = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext) ? ext : ext;

  // ── 3. Ensure destination directory exists ─────────────────────────────────
  const destDir = `${FileSystem.documentDirectory}converted/`;
  const dirInfo = await FileSystem.getInfoAsync(destDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
  }

  // ── 4. Build a unique destination filename ─────────────────────────────────
  // Strip any existing extension, sanitise, then re-add extension.
  const baseName  = rawName
    .replace(/\.[^.]+$/, '')                  // strip extension
    .replace(/[^a-zA-Z0-9._-]/g, '_')         // sanitise
    .slice(0, 80);                             // cap length
  const uniqueSuffix = Date.now().toString(36);
  const destFileName = `${baseName}_${uniqueSuffix}.${ext}`;
  const destUri      = `${destDir}${destFileName}`;

  // ── 5. Copy into app-private storage ──────────────────────────────────────
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  // Verify copy succeeded
  const destInfo = await FileSystem.getInfoAsync(destUri);
  if (!destInfo.exists) throw new Error('File copy failed — destination not found.');

  // ── 6. Save history record ─────────────────────────────────────────────────
  const entry = await saveConversion({
    fileName : destFileName,
    fileUri  : destUri,
    format,
    size     : destInfo.size ?? asset.size ?? 0,
    source   : 'imported',         // distinguishes from converted files in UI
  });

  return entry;
}
