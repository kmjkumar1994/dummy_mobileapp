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
export async function saveConversion({ fileName, fileUri, format, size }) {
  try {
    const entries = await readAll();
    const entry = {
      id: makeId(),
      fileName,
      fileUri,
      format: format.toLowerCase(),
      size: size || 0,
      createdAt: new Date().toISOString(),
    };
    // Newest first
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
