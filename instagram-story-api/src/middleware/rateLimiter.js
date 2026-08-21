const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000; // 15 minutes
const max = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 60; // 60 requests per window

const rateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests from this IP, please try again later.',
  },
});

module.exports = {
  rateLimiter,
};
