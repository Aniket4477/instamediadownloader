/**
 * app/api/lib/security.js
 *
 * Core defensive security utilities for Instagram Downloader Next.js API.
 * Provides SSRF protection, strict domain allowlisting, CORS origin enforcement,
 * safe MIME type handling, and input sanitization.
 */

const ALLOWED_CDN_DOMAIN_PATTERNS = [
  /^(?:[a-zA-Z0-9-]+\.)*cdninstagram\.com$/i,
  /^(?:[a-zA-Z0-9-]+\.)*fbcdn\.net$/i,
  /^(?:[a-zA-Z0-9-]+\.)*instagram\.com$/i,
  /^(?:[a-zA-Z0-9-]+\.)*akamaihd\.net$/i,
  /^(?:[a-zA-Z0-9-]+\.)*facebook\.com$/i,
  /^(?:[a-zA-Z0-9-]+\.)*meta\.com$/i,
];

// IP detection patterns (IPv4, IPv6)
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^\[?[0-9a-fA-F:]+\]?$/;

/**
 * Checks if an IP or hostname is private, loopback, link-local, or cloud metadata.
 */
export function isPrivateOrReservedHost(hostname) {
  if (!hostname) return true;

  const lower = hostname.toLowerCase().trim();

  // Localhost, local domains, mDNS, internal
  if (
    lower === 'localhost' ||
    lower.endsWith('.local') ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.corp') ||
    lower.endsWith('.home') ||
    lower.endsWith('.lan')
  ) {
    return true;
  }

  // IPv4 check
  if (IPV4_PATTERN.test(lower)) {
    const parts = lower.split('.').map((p) => parseInt(p, 10));
    if (parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

    const [a, b] = parts;
    // 0.0.0.0/8 (current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (RFC 1918 private)
    if (a === 10) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local, cloud metadata: 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (RFC 1918 private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (RFC 1918 private)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved)
    if (a >= 224) return true;

    return false;
  }

  // IPv6 check
  if (IPV6_PATTERN.test(lower)) {
    const clean = lower.replace(/^\[|\]$/g, '');
    if (clean === '::1' || clean === '::' || clean.startsWith('fe80:') || clean.startsWith('fc00:') || clean.startsWith('fd00:')) {
      return true;
    }
  }

  return false;
}

/**
 * Validates a remote URL against strict SSRF rules before proxying or fetching.
 */
export function validateProxyTargetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL parameter is required and must be a string' };
  }

  if (rawUrl.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum permitted length' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: 'Malformed URL format' };
  }

  // Strict protocol requirement: HTTPS only
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only secure HTTPS URLs are permitted' };
  }

  // Disallow user credentials in URL (e.g. https://user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Embedded URL credentials are not permitted' };
  }

  // Disallow non-standard ports
  if (parsed.port && parsed.port !== '443') {
    return { valid: false, error: 'Custom ports are not permitted' };
  }

  const hostname = parsed.hostname;

  // Reject IP addresses & internal/loopback hosts
  if (isPrivateOrReservedHost(hostname)) {
    return { valid: false, error: 'Internal, private, or loopback destinations are forbidden' };
  }

  // Strict domain allowlist matching
  const isAllowedHost = ALLOWED_CDN_DOMAIN_PATTERNS.some((pattern) => pattern.test(hostname));
  if (!isAllowedHost) {
    return { valid: false, error: 'Destination host is not an authorized Instagram or Meta CDN endpoint' };
  }

  return { valid: true, sanitizedUrl: parsed.toString() };
}

/**
 * Validates user input for Instagram URL or username handle.
 */
export function validateInstagramInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, error: 'Instagram URL or handle is required' };
  }

  let clean = rawInput.trim();

  if (clean.length > 500) {
    return { valid: false, error: 'Input exceeds maximum allowed length' };
  }

  // Handle format (@username or username)
  const handlePattern = /^@?[a-zA-Z0-9._]{1,30}$/;
  if (handlePattern.test(clean)) {
    return { valid: true, isHandle: true, cleanValue: clean };
  }

  // Prepend scheme if user pasted without http/https
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    if (clean.includes('instagram.com')) {
      clean = 'https://' + clean.replace(/^https?:\/\//i, '');
    }
  }

  // URL format
  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    return { valid: false, error: 'Invalid Instagram URL format' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'Only HTTP/HTTPS URLs are supported' };
  }

  // Must strictly be an official instagram.com domain
  const host = parsed.hostname.toLowerCase();
  const isOfficialHost = host === 'instagram.com' || host === 'www.instagram.com' || host.endsWith('.instagram.com');

  if (!isOfficialHost) {
    return { valid: false, error: 'Only official instagram.com URLs are permitted' };
  }

  return { valid: true, isHandle: false, cleanValue: parsed.toString() };
}

/**
 * Checks if origin is in the allowed CORS list.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return false;

  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '';
  const configuredList = allowedOriginsEnv
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  const defaultAllowed = [
    'https://instamediadownloader.vercel.app',
  ];

  const allAllowed = [...new Set([...configuredList, ...defaultAllowed])];
  const originLower = origin.toLowerCase().trim();

  // Allow local origins in non-production
  if (process.env.NODE_ENV !== 'production') {
    if (
      originLower.startsWith('http://localhost:') ||
      originLower.startsWith('http://127.0.0.1:') ||
      originLower === 'http://localhost' ||
      originLower === 'http://127.0.0.1'
    ) {
      return true;
    }
  }

  if (
    originLower.endsWith('.vercel.app') ||
    originLower.includes('localhost') ||
    originLower.includes('127.0.0.1')
  ) {
    return true;
  }

  return allAllowed.includes(originLower);
}

/**
 * Generates CORS headers tailored to the requesting origin.
 */
export function getCorsHeaders(request) {
  const origin = request?.headers?.get?.('origin') || '*';
  return {
    'Vary': 'Origin',
    'Access-Control-Allow-Origin': origin === '*' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Strict safe media MIME types
export const SAFE_MEDIA_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

/**
 * Validates and normalizes Content-Type header from upstream CDN.
 */
export function getSafeContentTypeAndExtension(rawContentType, urlHint = '') {
  const lower = (rawContentType || '').toLowerCase().split(';')[0].trim();

  if (SAFE_MEDIA_MIME_TYPES.has(lower)) {
    if (lower.includes('video') || lower.includes('mp4') || urlHint.includes('.mp4')) {
      return { contentType: lower, extension: 'mp4' };
    }
    if (lower.includes('webp') || urlHint.includes('.webp')) {
      return { contentType: lower, extension: 'webp' };
    }
    if (lower.includes('png') || urlHint.includes('.png')) {
      return { contentType: lower, extension: 'png' };
    }
    if (lower.includes('avif') || urlHint.includes('.avif')) {
      return { contentType: lower, extension: 'avif' };
    }
    return { contentType: lower, extension: 'jpg' };
  }

  // Fallback safe extension from url hint if upstream provided generic octet-stream
  if (urlHint.includes('.mp4')) {
    return { contentType: 'video/mp4', extension: 'mp4' };
  }
  if (urlHint.includes('.webp')) {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  if (urlHint.includes('.png')) {
    return { contentType: 'image/png', extension: 'png' };
  }

  // Default safe image
  return { contentType: 'image/jpeg', extension: 'jpg' };
}
