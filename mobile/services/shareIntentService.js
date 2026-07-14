/**
 * shareIntentService.js
 *
 * Handles everything related to receiving a file shared into the app from
 * another Android app (Files, WhatsApp, Telegram, Google Drive, etc.).
 *
 * Responsibilities:
 *  1. Parse the raw URI/MIME that Android delivers via intent extras
 *  2. Validate file type and size
 *  3. Copy the file from a content:// URI into app-private storage so it
 *     can be reliably uploaded by audioConverterService.js
 *  4. Return a normalised SharedFile object ready for the converter screen
 *
 * This service is pure JS — it has NO side effects on React state.  All
 * state management lives in ShareIntentContext / useShareIntent.
 */

import * as FileSystem from 'expo-file-system';
import {
  SUPPORTED_AUDIO_TYPES,
  MAX_SHARE_FILE_BYTES,
  MIME_LABELS,
} from '../types/shareIntent';

// Shared-file staging directory inside the app's cache (cleared on reboot/reinstall).
const SHARE_STAGING_DIR = `${FileSystem.cacheDirectory}share_staging/`;

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Ensure the staging directory exists. */
async function ensureStagingDir() {
  const info = await FileSystem.getInfoAsync(SHARE_STAGING_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(SHARE_STAGING_DIR, { intermediates: true });
  }
}

/**
 * Decode a URI-encoded component safely.
 * Falls back to the raw string on failure.
 */
function safeDecode(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}

/**
 * Best-effort extraction of a file name from a URI.
 * Handles:
 *   content://com.android.providers.media.documents/document/audio%3A1234
 *   file:///storage/emulated/0/Download/voice.opus
 *   content://media/external/audio/media/1234
 *
 * Exported so useShareIntent.js can call it directly with the raw native URI.
 */
export function extractFileName(uri) {
  try {
    const decoded = safeDecode(uri);
    const segments = decoded.split(/[\/\\]/);
    const last = segments[segments.length - 1];
    if (last && !last.includes(':') && last.includes('.')) {
      return last;
    }
    return 'shared_audio';
  } catch {
    return 'shared_audio';
  }
}

// Keep the old internal name pointing to the same function for any internal callers.
function extractNameFromUri(uri) {
  return extractFileName(uri);
}

/** Guess a MIME type from a file extension when the OS did not supply one. */
function guessMimeFromExtension(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop();
  const map = {
    opus: 'audio/opus',
    ogg:  'audio/ogg',
    aac:  'audio/aac',
    mp3:  'audio/mpeg',
    mp4:  'audio/mp4',
    m4a:  'audio/mp4',
    wav:  'audio/wav',
  };
  return map[ext] || null;
}

/**
 * Ensure the name has an appropriate audio extension.
 * Exported as ensureAudioExtensionFromMime for use by useShareIntent.js.
 */
export function ensureAudioExtensionFromMime(name, mimeType) {
  return ensureAudioExtension(name, mimeType);
}

/** Internal alias — keeps existing internal callers working. */
function ensureAudioExtension(name, mimeType) {
  const mimeExtMap = {
    'audio/opus':  '.opus',
    'audio/ogg':   '.ogg',
    'audio/aac':   '.aac',
    'audio/mpeg':  '.mp3',
    'audio/mp3':   '.mp3',
    'audio/wav':   '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4':   '.m4a',
  };

  const audioExts = ['.opus', '.ogg', '.aac', '.mp3', '.wav', '.m4a', '.mp4', '.flac', '.wma'];
  const lower = (name || '').toLowerCase();

  if (audioExts.some((ext) => lower.endsWith(ext))) return name;

  const ext = mimeExtMap[mimeType] || '.opus';
  return `${name}${ext}`;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Parse and validate the raw intent parameters that expo-router surfaces
 * as URL search params when the app is opened via a share intent.
 *
 * Handles both:
 *   • ACTION_SEND  → android.intent.extra.STREAM = content URI
 *   • ACTION_VIEW  → uri search param = content or file URI
 *
 * @param {Record<string, string | string[]>} params  - useLocalSearchParams() output
 * @returns {{ uri: string, rawName: string, mimeType: string } | null}
 */
export function parseIntentParams(params) {
  if (!params) return null;

  // --- ACTION_SEND path ---
  // expo-router encodes intent extras as query params using the extra key name
  let uri =
    params['android.intent.extra.STREAM'] ||
    params['STREAM'] ||
    params['stream'] ||
    null;

  // expo-linking may deliver it as an array when multiple files are shared
  if (Array.isArray(uri)) uri = uri[0];

  let mimeType = params['android.intent.extra.MIME_TYPE'] || params['mimeType'] || null;
  if (Array.isArray(mimeType)) mimeType = mimeType[0];

  // --- ACTION_VIEW path ---
  // The URI is the root param (the path itself decoded as a query param by expo-router)
  if (!uri) {
    // expo-router also surfaces the full URL; the content URI may be in `uri`
    uri = params['uri'] || params['path'] || null;
    if (Array.isArray(uri)) uri = uri[0];
  }

  if (!uri) return null;

  // Decode if it was double-encoded
  uri = safeDecode(uri);

  const rawName = extractNameFromUri(uri);

  if (!mimeType) {
    mimeType = guessMimeFromExtension(rawName) || 'application/octet-stream';
  }
  if (Array.isArray(mimeType)) mimeType = mimeType[0];

  return { uri, rawName, mimeType };
}

/**
 * Validate the parsed intent data.
 *
 * Returns `null` on success, or an error string explaining the rejection.
 *
 * @param {{ uri: string, mimeType: string }} parsed
 * @returns {string | null}
 */
export function validateSharedFile({ uri, mimeType }) {
  if (!uri) return 'No file URI was received.';

  // Allow application/octet-stream — we validate the extension later.
  const normalised = (mimeType || '').toLowerCase();
  const isSupported =
    SUPPORTED_AUDIO_TYPES.includes(normalised) ||
    normalised.startsWith('audio/');

  if (!isSupported) {
    const label = MIME_LABELS[normalised] || normalised || 'Unknown';
    return `Unsupported file type: ${label}. Please share an audio file (Opus, OGG, AAC, MP3 or WAV).`;
  }

  return null;
}

/**
 * Copy a shared file from a (possibly non-readable content://) URI into the
 * app's private staging directory.  Returns the local file:// URI.
 *
 * This is required because:
 *   - content:// URIs from other apps may revoke access after the intent is consumed
 *   - FileSystem.uploadAsync needs a stable file:// URI on Android
 *
 * @param {string}  sourceUri  - Content or file URI
 * @param {string}  fileName   - Destination file name (already has extension)
 * @param {(n: number) => void} [onProgress] - Optional progress callback (0-100)
 * @returns {Promise<{ localUri: string, size: number }>}
 */
export async function copySharedFileToStaging(sourceUri, fileName, onProgress) {
  await ensureStagingDir();

  onProgress?.(10);

  // Sanitise the file name for the local file system
  const safeName = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_');
  const destUri = `${SHARE_STAGING_DIR}${Date.now()}_${safeName}`;

  // If the source is already a local file:// URI, check it's accessible
  if (sourceUri.startsWith('file://')) {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (!info.exists) {
      throw new Error('The shared file could not be found on this device.');
    }
    if (info.size != null && info.size > MAX_SHARE_FILE_BYTES) {
      throw new Error(
        `File is too large (${(info.size / 1024 / 1024).toFixed(1)} MB). Maximum is 200 MB.`
      );
    }
    // For file:// URIs we can optionally just return them directly,
    // but we copy anyway to avoid permission issues on Android 10+.
    onProgress?.(40);
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  } else {
    // content:// URI — copy to staging (this is where Android grants us access)
    onProgress?.(20);
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    } catch (err) {
      throw new Error(
        `Could not read the shared file. Make sure the source app still has the file available. (${err.message})`
      );
    }
  }

  onProgress?.(80);

  const destInfo = await FileSystem.getInfoAsync(destUri);
  if (!destInfo.exists) {
    throw new Error('File was not saved properly after copying.');
  }

  if (destInfo.size != null && destInfo.size === 0) {
    await FileSystem.deleteAsync(destUri, { idempotent: true });
    throw new Error('The shared file is empty.');
  }

  if (destInfo.size != null && destInfo.size > MAX_SHARE_FILE_BYTES) {
    await FileSystem.deleteAsync(destUri, { idempotent: true });
    throw new Error(
      `File is too large (${(destInfo.size / 1024 / 1024).toFixed(1)} MB). Maximum is 200 MB.`
    );
  }

  onProgress?.(100);

  return { localUri: destUri, size: destInfo.size ?? null };
}

/**
 * Full pipeline: parse params → validate → copy to staging → return SharedFile.
 *
 * @param {Record<string, string | string[]>} params
 * @param {(n: number) => void} [onProgress]
 * @returns {Promise<import('../types/shareIntent').SharedFile>}
 */
export async function receiveSharedFile(params, onProgress) {
  const parsed = parseIntentParams(params);
  if (!parsed) {
    throw new Error('No audio file was included in the share request.');
  }

  const validationError = validateSharedFile(parsed);
  if (validationError) {
    throw new Error(validationError);
  }

  const { uri, rawName, mimeType } = parsed;
  const nameWithExt = ensureAudioExtension(rawName, mimeType);

  const { localUri, size } = await copySharedFileToStaging(
    uri,
    nameWithExt,
    onProgress
  );

  return {
    uri: localUri,
    name: nameWithExt,
    mimeType,
    size,
    source: 'share',
  };
}

/**
 * Remove all files from the staging directory.
 * Call after a successful conversion to reclaim cache space.
 */
export async function clearStagingDir() {
  try {
    const info = await FileSystem.getInfoAsync(SHARE_STAGING_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(SHARE_STAGING_DIR, { idempotent: true });
    }
    console.log('[ShareIntent] Staging directory cleared.');
  } catch (err) {
    // Non-critical — log but never throw
    console.warn('[ShareIntent] Failed to clear staging directory:', err?.message);
  }
}

/**
 * Delete a single staged file by its local URI.
 *
 * Safety rules:
 *   - Only deletes files whose URI starts with the staging directory path.
 *   - Silently no-ops for any URI outside the staging directory.
 *   - Never throws — cleanup failures must not affect the conversion flow.
 *
 * @param {string | null | undefined} localUri - The file:// URI returned by copySharedFileToStaging
 */
export async function clearStagingFile(localUri) {
  if (!localUri) return;

  // Safety guard: only allow deletion of files inside the staging directory
  if (!localUri.startsWith(SHARE_STAGING_DIR)) {
    console.warn('[ShareIntent] clearStagingFile: URI is outside staging dir, skipping.', localUri);
    return;
  }

  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    console.log('[ShareIntent] Staging file deleted:', localUri);
  } catch (err) {
    console.warn('[ShareIntent] Failed to delete staging file:', err?.message);
  }
}
