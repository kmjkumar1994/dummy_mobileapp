const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const requestLogger = require('./middleware/logger');
const { limiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin:
    //   - Native mobile apps (React Native / Expo APK) never send an Origin header
    //   - Postman, curl, health-check probes
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.CORS_ORIGIN,       // set this in Render env vars if you have a web frontend
      'http://localhost:3000',
      'http://localhost:8081',
      'exp://localhost:8081',
      'http://localhost:19000',
      'http://localhost:19006',
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Android emulator (10.0.2.2) and local dev hosts
    const emulatorPattern = /^https?:\/\/10\.0\.2\.2(:\d+)?$/;
    const localhostPattern = /^https?:\/\/localhost(:\d+)?$/;
    // Expo Go / dev client deep-link origins
    const expoPattern = /^exp:\/\//;
    if (
      emulatorPattern.test(origin) ||
      localhostPattern.test(origin) ||
      expoPattern.test(origin)
    ) {
      return callback(null, true);
    }

    // In production, unknown browser origins are blocked.
    // Mobile APKs are already handled above (no origin = allowed).
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Request logger (skip in test env)
if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global rate limiter
app.use(limiter);

// Converted audio files (WAV / MP3)
app.use('/downloads', express.static(OUTPUTS_DIR));

// Root — browsers and Render hit / on deploy
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    health: '/health',
    api: '/api',
    downloads: '/downloads',
  });
});

app.head('/', (req, res) => {
  res.status(200).end();
});

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
