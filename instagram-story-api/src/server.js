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
app.use(cors({ origin: '*' }));
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
