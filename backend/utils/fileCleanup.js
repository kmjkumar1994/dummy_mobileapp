const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads');
const OUTPUTS_DIR = path.join(BACKEND_ROOT, 'outputs');
const DEFAULT_RETENTION_HOURS = 6;

function getRetentionMs() {
  const hours = Number(process.env.AUDIO_RETENTION_HOURS) || DEFAULT_RETENTION_HOURS;
  return hours * 60 * 60 * 1000;
}

function cleanDirectory(dirPath, maxAgeMs) {
  if (!fs.existsSync(dirPath)) {
    return { deleted: 0, errors: 0 };
  }

  const now = Date.now();
  let deleted = 0;
  let errors = 0;

  for (const name of fs.readdirSync(dirPath)) {
    const filePath = path.join(dirPath, name);

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      if (now - stat.mtimeMs >= maxAgeMs) {
        fs.unlinkSync(filePath);
        deleted += 1;
        console.log(`[cleanup] Deleted expired file: ${name}`);
      }
    } catch (err) {
      errors += 1;
      console.error(`[cleanup] Failed to delete ${filePath}:`, err.message);
    }
  }

  return { deleted, errors };
}

function runAudioFileCleanup() {
  const maxAgeMs = getRetentionMs();
  const retentionHours = maxAgeMs / (60 * 60 * 1000);

  console.log(`[cleanup] Scanning uploads/ and outputs/ (retention: ${retentionHours}h)...`);

  const uploads = cleanDirectory(UPLOADS_DIR, maxAgeMs);
  const outputs = cleanDirectory(OUTPUTS_DIR, maxAgeMs);
  const total = uploads.deleted + outputs.deleted;

  if (total > 0) {
    console.log(
      `[cleanup] Removed ${total} expired file(s) — uploads: ${uploads.deleted}, outputs: ${outputs.deleted}`
    );
  } else {
    console.log('[cleanup] No expired files to remove');
  }

  return { uploads, outputs, total };
}

module.exports = { runAudioFileCleanup, getRetentionMs };
