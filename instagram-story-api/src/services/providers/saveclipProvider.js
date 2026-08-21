const StoryProvider = require('./provider');
const logger = require('../../utils/logger');

class SaveClipProvider extends StoryProvider {
  constructor(config = {}) {
    super('saveclip', config);
    this.baseUrl = config.baseUrl || 'https://saveclip.app';
    this.timeoutMs = config.timeoutMs || 12000;
  }

  async getStories(input) {
    const targetUrl = input.normalizedUrl;
    const searchUrl = `${this.baseUrl}/api/ajaxSearch`;

    try {
      logger.debug(`[SaveClip] Querying endpoint: ${searchUrl} for ${targetUrl}`);

      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Referer': `${this.baseUrl}/en`,
          'Origin': this.baseUrl,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({
          q: targetUrl,
          t: 'media',
          lang: 'en',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const responseText = await response.text();

      // Check for Cloudflare Turnstile Challenge or Anti-Bot WAF
      if (
        response.status === 403 ||
        responseText.includes('Just a moment...') ||
        responseText.includes('cf-browser-verification') ||
        responseText.includes('Turnstile')
      ) {
        logger.warn('[SaveClip] Cloudflare bot protection active. Provider unavailable for server-side integration.');
        this.status = 'unavailable';
        this.statusReason = 'Cloudflare Bot Protection Challenge';
        return {
          success: false,
          provider: this.name,
          username: input.username,
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      if (!response.ok) {
        logger.warn(`[SaveClip] HTTP ${response.status} returned`);
        return {
          success: false,
          provider: this.name,
          username: input.username,
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        logger.warn('[SaveClip] Malformed response JSON from provider');
        return {
          success: false,
          provider: this.name,
          username: input.username,
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      // Check for empty or private result indicators
      if (data.status === 'error' || data.mess) {
        const msg = (data.mess || '').toLowerCase();
        if (msg.includes('private')) {
          return {
            success: false,
            provider: this.name,
            username: input.username,
            reason: 'PRIVATE_ACCOUNT',
          };
        }
        if (msg.includes('no story') || msg.includes('not found')) {
          return {
            success: true,
            provider: this.name,
            username: input.username,
            stories: [],
          };
        }
      }

      // Parse HTML payload if returned inside data.data
      const stories = this.parseHtmlPayload(data.data || responseText);

      return {
        success: true,
        provider: this.name,
        username: input.username,
        stories,
      };
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        logger.warn(`[SaveClip] Request timed out after ${this.timeoutMs}ms`);
      } else {
        logger.warn(`[SaveClip] Network/Execution error: ${err.message}`);
      }
      return {
        success: false,
        provider: this.name,
        username: input.username,
        reason: 'PROVIDER_UNAVAILABLE',
      };
    }
  }

  parseHtmlPayload(html) {
    if (!html || typeof html !== 'string') return [];
    const stories = [];

    // Extract video elements
    const videoMatches = [...html.matchAll(/href="([^"]+)"[^>]*title="Download Video"/gi)];
    for (const m of videoMatches) {
      const url = m[1];
      if (url && url.startsWith('http')) {
        stories.push({
          type: 'video',
          url,
          mimeType: 'video/mp4',
        });
      }
    }

    // Extract image elements
    const photoMatches = [...html.matchAll(/href="([^"]+)"[^>]*title="Download Photo"/gi)];
    for (const m of photoMatches) {
      const url = m[1];
      if (url && url.startsWith('http')) {
        stories.push({
          type: 'image',
          url,
          mimeType: 'image/jpeg',
        });
      }
    }

    return stories;
  }
}

module.exports = SaveClipProvider;
