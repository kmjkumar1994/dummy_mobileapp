/**
 * shareIntent.js — type definitions (JSDoc) for share intent data.
 *
 * We're a JS project (no TypeScript), so these are JSDoc typedefs used
 * by IDEs and for documentation.
 */

/**
 * @typedef {Object} SharedFile
 * @property {string}  uri        - Content or file URI of the shared file
 * @property {string}  name       - Display file name (e.g. "voice_001.opus")
 * @property {string}  mimeType   - MIME type (e.g. "audio/opus")
 * @property {number|null} size   - File size in bytes, or null if unknown
 * @property {'share'|'view'|'picker'} source - How the file arrived
 */

/**
 * @typedef {'idle'|'receiving'|'ready'|'processed'|'error'} ShareIntentStatus
 */

/**
 * @typedef {Object} ShareIntentState
 * @property {SharedFile|null}   pendingFile  - File waiting to be processed
 * @property {ShareIntentStatus} status       - Current lifecycle state
 * @property {string|null}       error        - Error message if status === 'error'
 */

/**
 * @typedef {Object} ShareIntentContextValue
 * @property {SharedFile|null}   pendingFile      - File waiting to be processed
 * @property {ShareIntentStatus} status           - Current lifecycle state
 * @property {string|null}       error            - Error message if status === 'error'
 * @property {boolean}           hasFile          - Convenience: pendingFile !== null && status === 'ready'
 * @property {(file: SharedFile) => void} setSharedFile   - Store a received file
 * @property {() => void}                markProcessed   - Clear after successful import
 * @property {() => void}                clearError      - Reset to idle
 * @property {() => void}                dismiss         - Dismiss without processing
 */

// Supported MIME types that the conversion screen can handle.
export const SUPPORTED_AUDIO_TYPES = [
  'audio/opus',
  'audio/ogg',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'application/octet-stream', // generic binary — accepted, validated at copy step
];

// Human-readable labels for MIME types shown in the UI.
export const MIME_LABELS = {
  'audio/opus':               'Opus',
  'audio/ogg':                'OGG/Opus',
  'audio/aac':                'AAC',
  'audio/mpeg':               'MP3',
  'audio/mp3':                'MP3',
  'audio/wav':                'WAV',
  'audio/x-wav':              'WAV',
  'audio/mp4':                'M4A',
  'application/octet-stream': 'Audio',
};

// Max file size (bytes) we accept via share intent — 200 MB
export const MAX_SHARE_FILE_BYTES = 200 * 1024 * 1024;
