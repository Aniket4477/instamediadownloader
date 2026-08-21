/**
 * Structured Logger for Instagram Story Downloader API.
 * Sanitizes all output to ensure no passwords, cookies, session IDs, or tokens are logged.
 */

const SENSITIVE_PATTERNS = [
  /password[=:][^&,\s]+/gi,
  /sessionid[=:][^&,\s]+/gi,
  /token[=:][^&,\s]+/gi,
  /cookie[=:][^;\r\n]+/gi,
  /bearer\s+[a-z0-9._-]+/gi,
  /k_token[=:][^&,\s]+/gi,
];

function sanitize(message) {
  if (typeof message !== 'string') {
    try {
      message = JSON.stringify(message);
    } catch {
      message = String(message);
    }
  }

  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

const logger = {
  info: (msg, meta = '') => {
    console.log(`[Story] ${sanitize(msg)} ${meta ? sanitize(JSON.stringify(meta)) : ''}`.trim());
  },
  warn: (msg, meta = '') => {
    console.warn(`[Story] [WARN] ${sanitize(msg)} ${meta ? sanitize(JSON.stringify(meta)) : ''}`.trim());
  },
  error: (msg, meta = '') => {
    console.error(`[Story] [ERROR] ${sanitize(msg)} ${meta ? sanitize(JSON.stringify(meta)) : ''}`.trim());
  },
  debug: (msg, meta = '') => {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      console.debug(`[Story] [DEBUG] ${sanitize(msg)} ${meta ? sanitize(JSON.stringify(meta)) : ''}`.trim());
    }
  },
};

module.exports = logger;
