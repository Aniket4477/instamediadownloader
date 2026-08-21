/**
 * Instagram URL and input parser with SSRF protection.
 */

// Forbidden IP ranges for SSRF prevention
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fe80::/i,
];

function isPrivateIpOrHost(hostname) {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Validates and parses an input string into a normalized Instagram Story query.
 * 
 * @param {string} input - Instagram URL, @handle, or username
 * @returns {{
 *   isValid: boolean,
 *   username?: string,
 *   storyId?: string,
 *   normalizedUrl?: string,
 *   error?: string
 * }}
 */
function parseAndValidateInstagramInput(input) {
  if (!input || typeof input !== 'string') {
    return { isValid: false, error: 'Input URL or username is required and must be a string.' };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 500) {
    return { isValid: false, error: 'Input is empty or exceeds maximum length.' };
  }

  // Case 1: @username or plain username
  if (/^@?[a-zA-Z0-9._]{1,30}$/.test(trimmed) && !trimmed.startsWith('http')) {
    const cleanUser = trimmed.replace(/^@/, '').toLowerCase();
    if (cleanUser.startsWith('.') || cleanUser.endsWith('.') || cleanUser.includes('..')) {
      return { isValid: false, error: 'Invalid Instagram username format.' };
    }
    return {
      isValid: true,
      username: cleanUser,
      normalizedUrl: `https://www.instagram.com/stories/${cleanUser}/`,
    };
  }

  // Case 2: Full URL
  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format.' };
  }

  // Enforce HTTPS
  if (parsedUrl.protocol !== 'https:') {
    return { isValid: false, error: 'Only secure HTTPS Instagram URLs are supported.' };
  }

  // SSRF Protection: verify hostname
  const host = parsedUrl.hostname.toLowerCase();
  if (isPrivateIpOrHost(host)) {
    return { isValid: false, error: 'Access to local or private network addresses is forbidden.' };
  }

  if (host !== 'instagram.com' && host !== 'www.instagram.com' && !host.endsWith('.instagram.com')) {
    return { isValid: false, error: 'Only official instagram.com URLs are permitted.' };
  }

  const pathname = parsedUrl.pathname.replace(/\/+$/, ''); // strip trailing slash
  const pathParts = pathname.split('/').filter(Boolean);

  // Pattern A: /stories/:username/:storyId
  if (pathParts[0] === 'stories' && pathParts.length >= 2) {
    const user = pathParts[1].toLowerCase();
    const storyId = pathParts[2] || undefined;
    return {
      isValid: true,
      username: user,
      storyId,
      normalizedUrl: storyId
        ? `https://www.instagram.com/stories/${user}/${storyId}/`
        : `https://www.instagram.com/stories/${user}/`,
    };
  }

  // Pattern B: /:username (Profile URL)
  if (pathParts.length === 1 && !['p', 'reel', 'reels', 'tv', 'explore', 'accounts'].includes(pathParts[0].toLowerCase())) {
    const user = pathParts[0].toLowerCase();
    return {
      isValid: true,
      username: user,
      normalizedUrl: `https://www.instagram.com/stories/${user}/`,
    };
  }

  return { isValid: false, error: 'Could not extract valid public Instagram story or user profile from URL.' };
}

module.exports = {
  parseAndValidateInstagramInput,
  isPrivateIpOrHost,
};
