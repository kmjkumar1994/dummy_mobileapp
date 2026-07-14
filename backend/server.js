require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const app = require('./app');
const connectDB = require('./config/db');
const { runAudioFileCleanup, getRetentionMs } = require('./utils/fileCleanup');

const PORT = process.env.PORT || 5000;
const BACKEND_ROOT = __dirname;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // re-check every hour

let cleanupTimer;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[server] Created directory: ${dirPath}`);
  }
}

function logFfmpegVersion() {
  try {
    const line = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
    console.log(`[server] ${line}`);
  } catch {
    console.error('[server] WARNING: ffmpeg not found — audio conversion will fail');
  }
}

const startServer = async () => {
  try {
    ensureDir(path.join(BACKEND_ROOT, 'uploads'));
    ensureDir(path.join(BACKEND_ROOT, 'outputs'));

    logFfmpegVersion();

    runAudioFileCleanup();
    cleanupTimer = setInterval(runAudioFileCleanup, CLEANUP_INTERVAL_MS);

    // ── Keep-alive ping (Render free tier sleeps after 15 min inactivity) ──
    // Pings own /health endpoint every 10 minutes so the server never sleeps.
    // Only runs in production — no need to ping during local development.
    let keepAliveTimer;
    if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
      const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
      const healthUrl = `${process.env.RENDER_EXTERNAL_URL}/health`;
      keepAliveTimer = setInterval(async () => {
        try {
          const res = await fetch(healthUrl);
          console.log(`[keep-alive] ping ${healthUrl} → ${res.status}`);
        } catch (err) {
          console.warn(`[keep-alive] ping failed: ${err.message}`);
        }
      }, PING_INTERVAL_MS);
      console.log(`[keep-alive] Self-ping active every 10 min → ${healthUrl}`);
    }

    // Connect to MongoDB
    await connectDB();

    // Start HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🚀 ================================');
      console.log(`🚀  Server running on port ${PORT}`);
      console.log(`🚀  Environment: ${process.env.NODE_ENV}`);
      console.log(`🚀  Health: http://localhost:${PORT}/health`);
      console.log(`🚀  API Base: http://localhost:${PORT}/api`);
      console.log(`🚀  Audio:  POST ${PORT}/api/audio/opus-to-wav`);
      console.log(`🚀  Downloads: http://localhost:${PORT}/downloads/`);
      console.log(`🚀  Audio retention: ${getRetentionMs() / (60 * 60 * 1000)}h (server auto-cleanup)`);
      console.log('🚀 ================================');
      console.log('');
    });

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      if (cleanupTimer) clearInterval(cleanupTimer);
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      server.close(() => process.exit(1));
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
