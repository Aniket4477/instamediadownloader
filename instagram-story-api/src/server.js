require('dotenv').config();
const express = require('express');
const cors = require('cors');
const instagramRoutes = require('./routes/instagram');
const { errorHandler } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Security & Utility Middleware ──────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// ── Health Check Endpoint ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'instagram-story-api',
    provider: process.env.STORY_PROVIDER || 'fabula',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/instagram', instagramRoutes);

// ── 404 Handler for Unknown Routes ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// ── Global Centralized Error Handler ───────────────────────────────────────
app.use(errorHandler);

// Start server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Instagram Story API] Server running on http://localhost:${PORT}`);
    console.log(`[Instagram Story API] Active Provider: ${process.env.STORY_PROVIDER || 'fabula'}`);
  });
}

module.exports = app;
