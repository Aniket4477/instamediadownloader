module.exports = {
  saveclip: {
    name: 'saveclip',
    enabled: process.env.ENABLE_SAVECLIP !== 'false',
    baseUrl: process.env.SAVECLIP_BASE_URL || 'https://saveclip.app',
    timeoutMs: parseInt(process.env.SAVECLIP_TIMEOUT_MS, 10) || 12000,
  },
  instasaver: {
    name: 'instasaver',
    enabled: process.env.ENABLE_INSTASAVER !== 'false',
    baseUrl: process.env.INSTASAVER_BASE_URL || 'https://instasaver.io',
    timeoutMs: parseInt(process.env.INSTASAVER_TIMEOUT_MS, 10) || 12000,
  },
  cache: {
    ttlMs: parseInt(process.env.CACHE_TTL_MS, 10) || 5 * 60 * 1000, // 5 minutes
    maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES, 10) || 500,
  },
  security: {
    allowedHostnames: ['instagram.com', 'www.instagram.com', 'saveclip.app', 'v3.saveclip.app', 'instasaver.io'],
    maxPayloadSizeBytes: 1024 * 1024 * 5, // 5MB
  }
};
