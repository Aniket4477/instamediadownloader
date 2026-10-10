require('dotenv').config();
const express = require('express');
const cors = require('cors');
const instagramRoutes = require('./routes/instagram');
const { handleProvidersStatus } = require('./controllers/storyController');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');
const config = require('./config/providers');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 4000;

// ── 1. Security & Core Middleware ──────────────────────────────────────────
// Secure CORS allowlist (disallowing wildcard * in production)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://instamediadownloader.vercel.app')
  .split(',')
  .map((o) => o.trim().toLowerCase())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Same-origin or non-browser / server-to-server
    const originLower = origin.toLowerCase();
    if (
      ALLOWED_ORIGINS.includes(originLower) ||
      (process.env.NODE_ENV !== 'production' &&
        (originLower.startsWith('http://localhost:') || originLower.startsWith('http://127.0.0.1:')))
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: false,
};

app.use(cors(corsOptions));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: config.security.maxPayloadSizeBytes }));
app.use(express.urlencoded({ extended: true, limit: config.security.maxPayloadSizeBytes }));
app.use(rateLimiter);

// ── 2. Health & Provider Status Endpoints ──────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'instagram-story-downloader',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/providers/status', handleProvidersStatus);

// ── 3. API Routes ──────────────────────────────────────────────────────────
app.use('/api/instagram', instagramRoutes);

// ── 4. 404 Handler for Unknown Routes ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// ── 5. Global Centralized Error Handler ────────────────────────────────────
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info('Registered providers: SaveClip, InstaSaver');
  });
}

module.exports = app;
