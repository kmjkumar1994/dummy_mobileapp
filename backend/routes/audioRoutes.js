const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const multer = require('multer');
const { protect } = require('../middleware/auth');

const execAsync = promisify(exec);

const router = express.Router();

router.use(protect);

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads');
const OUTPUTS_DIR = path.join(BACKEND_ROOT, 'outputs');

/** DDMMYYYY_HH-MM-SS (dashes in time — safe for Windows filenames) */
function makeTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${date}_${time}`;
}

function stampFromWavDownloadPath(wavPath) {
  const base = path.basename(String(wavPath).replace(/\\/g, '/'));
  const match = base.match(/^(.+)_output\.wav$/i);
  return match ? match[1] : null;
}

function pathsForStamp(stamp) {
  return {
    inputOpus: path.join(UPLOADS_DIR, `${stamp}_input.opus`),
    outputWav: path.join(OUTPUTS_DIR, `${stamp}_output.wav`),
    finalMp3: path.join(OUTPUTS_DIR, `${stamp}_final.mp3`),
    wavDownload: `/downloads/${stamp}_output.wav`,
    mp3Download: `/downloads/${stamp}_final.mp3`,
  };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, _file, cb) => {
      const stamp = req.conversionStamp || makeTimestamp();
      req.conversionStamp = stamp;
      cb(null, `${stamp}_input.opus`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Separate multer config for /edit — the source there is an already-converted
// WAV or MP3 (not opus), re-uploaded fresh from the phone since the original
// server-side file is long gone by the time a user opens the editor.
const editUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const stamp = req.editStamp || makeTimestamp();
      req.editStamp = stamp;
      const ext = (path.extname(file.originalname || '') || '.wav').toLowerCase();
      cb(null, `${stamp}_edit_input${ext}`);
    },
  }),
  limits: { fileSize: 150 * 1024 * 1024 },
});

function runFfmpeg(command, label) {
  console.log(`[audio] FFmpeg (${label}): ${command}`);
  return execAsync(command, {
    cwd: BACKEND_ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function resolveWavFile(wavPath) {
  if (!wavPath || typeof wavPath !== 'string') {
    return null;
  }

  const basename = path.basename(wavPath.replace(/\\/g, '/'));
  const fromOutputs = path.join(OUTPUTS_DIR, basename);

  if (fs.existsSync(fromOutputs)) {
    return fromOutputs;
  }

  if (path.isAbsolute(wavPath) && fs.existsSync(wavPath)) {
    return wavPath;
  }

  return null;
}

// POST /api/audio/opus-to-wav
router.post(
  '/opus-to-wav',
  (req, _res, next) => {
    req.conversionStamp = makeTimestamp();
    next();
  },
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        console.log('[audio] opus-to-wav: no file received');
        return res.status(400).json({ success: false, message: 'No file uploaded (field name: file)' });
      }

      const stamp = req.conversionStamp || stampFromWavDownloadPath(req.file.filename) || makeTimestamp();
      const { inputOpus, outputWav, wavDownload } = pathsForStamp(stamp);

      console.log('[audio] opus-to-wav: file received', {
        originalName: req.file.originalname,
        size: req.file.size,
        stamp,
        path: req.file.path,
      });

      if (!fs.existsSync(inputOpus)) {
        return res.status(400).json({ success: false, message: 'Upload failed — input file not found' });
      }

      const command = `ffmpeg -y -c:a libopus -i "${inputOpus}" -af aresample=async=1 -ar 48000 "${outputWav}"`;
      await runFfmpeg(command, 'opus-to-wav');

      if (!fs.existsSync(outputWav)) {
        console.error('[audio] opus-to-wav: WAV was not created', outputWav);
        return res.status(500).json({ success: false, message: 'WAV file was not created' });
      }

      console.log('[audio] opus-to-wav: success →', wavDownload);
      return res.json({
        success: true,
        wavPath: wavDownload,
        stamp,
      });
    } catch (err) {
      console.error('[audio] opus-to-wav: failure', err.stderr || err.message || err);
      return res.status(500).json({
        success: false,
        message: err.stderr || err.message || 'FFmpeg conversion failed',
      });
    }
  }
);

// POST /api/audio/wav-to-mp3
router.post('/wav-to-mp3', async (req, res) => {
  try {
    const { wavPath } = req.body || {};
    console.log('[audio] wav-to-mp3: request body', { wavPath });

    const wavFile = resolveWavFile(wavPath);
    if (!wavFile) {
      console.error('[audio] wav-to-mp3: WAV not found for', wavPath);
      return res.status(400).json({
        success: false,
        message: 'WAV file not found. Convert to WAV first.',
      });
    }

    const stamp = stampFromWavDownloadPath(wavPath) || stampFromWavDownloadPath(wavFile);
    if (!stamp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wavPath — expected /downloads/DDMMYYYY_HH-MM-SS_output.wav',
      });
    }

    const { finalMp3, mp3Download } = pathsForStamp(stamp);

    const command = `ffmpeg -y -i "${wavFile}" -b:a 192k "${finalMp3}"`;
    await runFfmpeg(command, 'wav-to-mp3');

    if (!fs.existsSync(finalMp3)) {
      console.error('[audio] wav-to-mp3: MP3 was not created', finalMp3);
      return res.status(500).json({ success: false, message: 'MP3 file was not created' });
    }

    console.log('[audio] wav-to-mp3: success →', mp3Download);
    return res.json({
      success: true,
      mp3Url: mp3Download,
      stamp,
    });
  } catch (err) {
    console.error('[audio] wav-to-mp3: failure', err.stderr || err.message || err);
    return res.status(500).json({
      success: false,
      message: err.stderr || err.message || 'FFmpeg conversion failed',
    });
  }
});

const VOICE_PITCH_FACTOR = {
  child: 1.35,
  woman: 1.15,
  man: 0.85,
};

/** Reads the audio stream's sample rate via ffprobe; falls back to 44100 if unknown. */
async function probeSampleRate(inputPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 "${inputPath}"`,
      { cwd: BACKEND_ROOT }
    );
    const sr = parseInt(String(stdout).trim(), 10);
    return Number.isFinite(sr) && sr > 0 ? sr : 44100;
  } catch {
    return 44100;
  }
}

/**
 * Builds an ffmpeg filter_complex graph that:
 *  - trims out each kept segment (asetpts resets each segment's own timeline)
 *  - applies a volume level (0.0-1.5) to each segment — 0 is silent, 1 is
 *    original volume, up to 1.5 boosts it — kept in place either way
 *  - concatenates everything back together in order
 *  - optionally runs the result through a noise-reduction filter (afftdn)
 *  - optionally pitch-shifts the result for a Child/Woman/Man voice preset,
 *    using asetrate+aresample+atempo (pitch changes without changing speed) —
 *    standard ffmpeg filters, no extra models/plugins required
 *
 * `segments` is already the final "keep" list — deleted segments are simply
 * absent from the array, so the gap they left closes naturally on concat.
 *
 * Returns { graph, finalLabel } — pass finalLabel to `-map "[<finalLabel>]"`.
 */
function buildEditFilter(segments, { reduceNoise, voicePreset, sampleRate } = {}) {
  const labels = [];
  const parts = segments.map((seg, i) => {
    const label = `a${i}`;
    labels.push(`[${label}]`);
    const trim = `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS`;
    return `${trim},volume=${seg.volume.toFixed(2)}[${label}]`;
  });
  const concat = `${labels.join('')}concat=n=${segments.length}:v=0:a=1[outa]`;

  const chain = [...parts, concat];
  let finalLabel = 'outa';

  if (reduceNoise) {
    const nextLabel = 'denoised';
    chain.push(`[${finalLabel}]afftdn=nf=-25[${nextLabel}]`);
    finalLabel = nextLabel;
  }

  const factor = VOICE_PITCH_FACTOR[voicePreset];
  if (factor) {
    const sr = sampleRate || 44100;
    const newRate = Math.round(sr * factor);
    const atempo = (1 / factor).toFixed(4);
    const nextLabel = 'voiced';
    chain.push(`[${finalLabel}]asetrate=${newRate},aresample=${sr},atempo=${atempo}[${nextLabel}]`);
    finalLabel = nextLabel;
  }

  return { graph: chain.join('; '), finalLabel };
}

// POST /api/audio/edit
// Segment-based editor: split/trim/mute, rendered into ONE new file.
// Body (multipart): file=<wav|mp3>, format='wav'|'mp3', segments=JSON string
//   of the KEPT segments only: [{ start, end, volume }, ...] in seconds,
//   volume as a 0.0-1.5 multiplier (0 = silent, 1 = original, 1.5 = boosted).
//   Optional: reduceNoise='true'|'false', voicePreset='original'|'child'|'woman'|'man'.
router.post(
  '/edit',
  (req, _res, next) => {
    req.editStamp = makeTimestamp();
    next();
  },
  editUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        console.log('[audio] edit: no file received');
        return res.status(400).json({ success: false, message: 'No file uploaded (field name: file)' });
      }

      const stamp = req.editStamp || makeTimestamp();
      const format = (req.body.format || '').toLowerCase() === 'mp3' ? 'mp3' : 'wav';
      const reduceNoise = req.body.reduceNoise === 'true' || req.body.reduceNoise === true;
      const voicePresetRaw = (req.body.voicePreset || '').toLowerCase();
      const voicePreset = ['child', 'woman', 'man'].includes(voicePresetRaw) ? voicePresetRaw : null;

      let rawSegments;
      try {
        rawSegments = JSON.parse(req.body.segments || '[]');
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid segments JSON.' });
      }

      if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one segment must be kept.' });
      }

      const segments = rawSegments
        .map((s) => ({
          start: Math.max(0, Number(s.start)),
          end: Math.max(0, Number(s.end)),
          volume: Number.isFinite(Number(s.volume)) ? Math.min(1.5, Math.max(0, Number(s.volume))) : 1,
        }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end - s.start > 0.01);

      if (segments.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid segments to keep.' });
      }

      console.log('[audio] edit: request', {
        originalName: req.file.originalname,
        stamp,
        format,
        segmentCount: segments.length,
        reduceNoise,
        voicePreset: voicePreset || 'original',
      });

      const inputPath = req.file.path;
      const outputPath = path.join(OUTPUTS_DIR, `${stamp}_edited.${format}`);
      const outputDownload = `/downloads/${stamp}_edited.${format}`;

      const sampleRate = voicePreset ? await probeSampleRate(inputPath) : null;
      const { graph, finalLabel } = buildEditFilter(segments, { reduceNoise, voicePreset, sampleRate });
      const codecArgs = format === 'mp3' ? '-b:a 192k' : '';
      const command = `ffmpeg -y -i "${inputPath}" -filter_complex "${graph}" -map "[${finalLabel}]" ${codecArgs} "${outputPath}"`;

      await runFfmpeg(command, 'edit');

      if (!fs.existsSync(outputPath)) {
        console.error('[audio] edit: output was not created', outputPath);
        return res.status(500).json({ success: false, message: 'Edited file was not created' });
      }

      console.log('[audio] edit: success →', outputDownload);
      return res.json({
        success: true,
        editedPath: outputDownload,
        stamp,
      });
    } catch (err) {
      console.error('[audio] edit: failure', err.stderr || err.message || err);
      return res.status(500).json({
        success: false,
        message: err.stderr || err.message || 'FFmpeg edit failed',
      });
    }
  }
);

module.exports = router;
