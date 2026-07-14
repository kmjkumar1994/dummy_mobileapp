import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';

const API_ROOT = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5000/api').replace(
  /\/$/,
  ''
);

const OUTPUT_DIR = `${FileSystem.documentDirectory}converted/`;
const UPLOAD_CACHE_DIR = `${FileSystem.cacheDirectory}uploads/`;

function toDisplayPath(uri) {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

/**
 * Strip the file extension from any audio filename.
 * Examples:
 *   voice.opus  → voice
 *   track.mp3   → track
 *   audio.aac   → audio
 *   file.m4a    → file
 *   noext       → noext
 */
function getBaseName(fileName) {
  return fileName.replace(/\.[^/.]+$/, '');
}

/** Returns a timestamp string in DDMMYYYY_HHMMSS format. */
function getTimestamp() {
  const now = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const HH   = String(now.getHours()).padStart(2, '0');
  const MM   = String(now.getMinutes()).padStart(2, '0');
  const SS   = String(now.getSeconds()).padStart(2, '0');
  return `${dd}${mm}${yyyy}_${HH}${MM}${SS}`;
}

/**
 * Resolve the MIME type to use when uploading an audio file.
 * Falls back to application/octet-stream if the type is absent or unrecognised.
 */
function resolveUploadMimeType(mimeType) {
  const known = [
    'audio/opus',
    'audio/ogg',
    'audio/aac',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/webm',
  ];
  const normalised = (mimeType || '').toLowerCase().trim();
  if (normalised && known.includes(normalised)) return normalised;
  // audio/* catch-all — accept any audio sub-type the OS reports
  if (normalised.startsWith('audio/')) return normalised;
  return 'application/octet-stream';
}

async function ensureOutputDir() {
  const info = await FileSystem.getInfoAsync(OUTPUT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(OUTPUT_DIR, { intermediates: true });
  }
}

/** Copy content:// URIs to cache so multipart upload is stable on Android. */
async function resolveUploadUri(sourceUri, fileName) {
  if (!sourceUri) {
    throw new Error('No file selected.');
  }

  if (sourceUri.startsWith('file://')) {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (!info.exists) {
      throw new Error('Selected file no longer exists. Pick it again.');
    }
    return sourceUri;
  }

  const cacheInfo = await FileSystem.getInfoAsync(UPLOAD_CACHE_DIR);
  if (!cacheInfo.exists) {
    await FileSystem.makeDirectoryAsync(UPLOAD_CACHE_DIR, { intermediates: true });
  }

  const safeName = (fileName || 'upload.opus').replace(/[^\w.\-]/g, '_');
  const destUri = `${UPLOAD_CACHE_DIR}${Date.now()}_${safeName}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  const copied = await FileSystem.getInfoAsync(destUri);
  if (!copied.exists) {
    throw new Error('Could not prepare the file for upload.');
  }

  return destUri;
}

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseJsonResponse(body, fallbackMessage) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(fallbackMessage);
  }

  if (data?.success === false) {
    throw new Error(data?.message || fallbackMessage);
  }

  return data;
}

function resolveDownloadUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  const apiOrigin = API_ROOT.replace(/\/api\/?$/, '');
  return url.startsWith('/') ? `${apiOrigin}${url}` : `${API_ROOT}/${url}`;
}

function throwHttpError(status, body, fallback) {
  let message = `${fallback} (HTTP ${status})`;
  try {
    const data = JSON.parse(body);
    if (data?.message) message = data.message;
  } catch {
    // keep default message
  }
  throw new Error(message);
}

async function downloadToOutput(downloadUrl, outputUri, onProgress) {
  onProgress?.(60);

  const headers = await getAuthHeaders();
  delete headers['Content-Type'];

  const result = await FileSystem.downloadAsync(resolveDownloadUrl(downloadUrl), outputUri, {
    headers,
  });

  onProgress?.(95);

  const outInfo = await FileSystem.getInfoAsync(result.uri);
  if (!outInfo.exists) {
    throw new Error('Converted file was not saved.');
  }

  return {
    uri: result.uri,
    path: toDisplayPath(result.uri),
    size: outInfo.size,
  };
}

/**
 * POST /api/audio/opus-to-wav → { success, wavPath: "/downloads/output.wav" }
 *
 * @param {string}   sourceUri  - Local file:// or content:// URI
 * @param {string}   fileName   - Original file name (used for base name + server param)
 * @param {Function} onProgress - Progress callback (0-100)
 * @param {string}   [mimeType] - Actual MIME type of the source file; defaults to
 *                                application/octet-stream if omitted or unknown.
 */
export async function convertOpusToWav(sourceUri, fileName, onProgress, mimeType) {
  await ensureOutputDir();

  const baseName = `${getBaseName(fileName)}_${getTimestamp()}`;
  const outputUri = `${OUTPUT_DIR}${baseName}.wav`;

  const existing = await FileSystem.getInfoAsync(outputUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(outputUri, { idempotent: true });
  }

  onProgress?.(5);

  const uploadUri = await resolveUploadUri(sourceUri, fileName);
  onProgress?.(10);

  const authHeaders = await getAuthHeaders();
  delete authHeaders['Content-Type'];

  // Use the actual MIME type so the server receives the correct content-type
  // header in the multipart part — critical for non-Opus inputs (AAC, MP3, etc.)
  const uploadMimeType = resolveUploadMimeType(mimeType);

  const upload = await FileSystem.uploadAsync(
    `${API_ROOT}/audio/opus-to-wav`,
    uploadUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: uploadMimeType,
      parameters: { fileName },
      headers: authHeaders,
    }
  );

  onProgress?.(40);

  if (upload.status < 200 || upload.status >= 300) {
    throwHttpError(upload.status, upload.body, 'WAV conversion failed');
  }

  const payload = parseJsonResponse(upload.body, 'Invalid response from conversion server.');
  const downloadUrl = payload.wavPath;
  if (!downloadUrl) {
    throw new Error('Server did not return wavPath for the WAV file.');
  }

  const saved = await downloadToOutput(downloadUrl, outputUri, onProgress);
  onProgress?.(100);

  return {
    ...saved,
    fileName: `${baseName}.wav`,
    wavPath: downloadUrl,
  };
}

/**
 * POST /api/audio/wav-to-mp3 → { success, mp3Url: "/downloads/final.mp3" }
 */
export async function convertWavToMp3(wavOutput, opusFileName, onProgress) {
  const wavPath = typeof wavOutput === 'string' ? wavOutput : wavOutput?.wavPath;

  if (!wavPath) {
    throw new Error('WAV path missing. Convert to WAV first.');
  }

  await ensureOutputDir();

  const baseName = `${getBaseName(opusFileName)}_${getTimestamp()}`;
  const outputUri = `${OUTPUT_DIR}${baseName}.mp3`;

  const existing = await FileSystem.getInfoAsync(outputUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(outputUri, { idempotent: true });
  }

  onProgress?.(5);

  const response = await fetch(`${API_ROOT}/audio/wav-to-mp3`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ wavPath }),
  });

  const body = await response.text();
  onProgress?.(40);

  if (!response.ok) {
    throwHttpError(response.status, body, 'MP3 conversion failed');
  }

  const payload = parseJsonResponse(body, 'Invalid response from conversion server.');
  const downloadUrl = payload.mp3Url;
  if (!downloadUrl) {
    throw new Error('Server did not return mp3Url for the MP3 file.');
  }

  const saved = await downloadToOutput(downloadUrl, outputUri, onProgress);
  onProgress?.(100);

  return {
    ...saved,
    fileName: `${baseName}.mp3`,
  };
}

export function getConverterOutputDir() {
  return OUTPUT_DIR;
}

/**
 * POST /api/audio/edit → { success, editedPath: "/downloads/..._edited.wav" }
 *
 * Segment-based edit: uploads the local file fresh (the server copy from the
 * original conversion is long gone by the time someone opens the editor),
 * asks the server to keep only `segments` (already excludes anything the
 * user deleted, and carries each part's volume level), and downloads the
 * single resulting file, saved with an "edited_" prefix.
 *
 * @param {string} sourceUri - Local file:// URI of the file being edited
 * @param {string} fileName  - Current file name (used for the output base name)
 * @param {string} format    - 'wav' | 'mp3'
 * @param {Array<{start:number,end:number,volume:number}>} segments - kept segments, in seconds; volume is a 0.0-1.5 multiplier
 * @param {Object} [options]
 * @param {'original'|'child'|'woman'|'man'} [options.voicePreset] - pitch-shift preset; omit/'original' for no change
 * @param {boolean} [options.reduceNoise] - run the result through a noise-reduction filter
 * @param {Function} [onProgress] - Progress callback (0-100)
 */
export async function editAudioSegments(sourceUri, fileName, format, segments, options, onProgress) {
  const { voicePreset = 'original', reduceNoise = false } = options || {};

  await ensureOutputDir();

  const fmt = format === 'mp3' ? 'mp3' : 'wav';
  const baseName = `edited_${getBaseName(fileName)}_${getTimestamp()}`;
  const outputUri = `${OUTPUT_DIR}${baseName}.${fmt}`;

  const existing = await FileSystem.getInfoAsync(outputUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(outputUri, { idempotent: true });
  }

  onProgress?.(5);

  const uploadUri = await resolveUploadUri(sourceUri, fileName);
  onProgress?.(10);

  const authHeaders = await getAuthHeaders();
  delete authHeaders['Content-Type'];

  const mimeType = fmt === 'mp3' ? 'audio/mpeg' : 'audio/wav';

  const upload = await FileSystem.uploadAsync(
    `${API_ROOT}/audio/edit`,
    uploadUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      parameters: {
        format: fmt,
        segments: JSON.stringify(segments),
        voicePreset,
        reduceNoise: String(reduceNoise),
      },
      headers: authHeaders,
    }
  );

  onProgress?.(50);

  if (upload.status < 200 || upload.status >= 300) {
    throwHttpError(upload.status, upload.body, 'Audio edit failed');
  }

  const payload = parseJsonResponse(upload.body, 'Invalid response from edit server.');
  const downloadUrl = payload.editedPath;
  if (!downloadUrl) {
    throw new Error('Server did not return editedPath for the edited file.');
  }

  const saved = await downloadToOutput(downloadUrl, outputUri, onProgress);
  onProgress?.(100);

  return {
    ...saved,
    fileName: `${baseName}.${fmt}`,
  };
}

export async function clearConverterOutputs() {
  const info = await FileSystem.getInfoAsync(OUTPUT_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(OUTPUT_DIR, { idempotent: true });
  }
}
