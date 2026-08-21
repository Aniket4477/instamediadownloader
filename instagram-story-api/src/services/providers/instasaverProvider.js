const StoryProvider = require('./provider');
const logger = require('../../utils/logger');

class InstaSaverProvider extends StoryProvider {
  constructor(config = {}) {
    super('instasaver', config);
    this.baseUrl = config.baseUrl || 'https://instasaver.io';
    this.timeoutMs = config.timeoutMs || 12000;
  }

  async getStories(input) {
    const targetUrl = input.normalizedUrl;
    const downloadEndpoint = `${this.baseUrl}/api/download`;

    try {
      logger.debug(`[InstaSaver] Querying endpoint: ${downloadEndpoint} for ${targetUrl}`);

      const response = await fetch(downloadEndpoint, {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Referer': `${this.baseUrl}/`,
          'Origin': this.baseUrl,
          'Accept': 'application/json, text/plain, */*',
        },
        body: JSON.stringify({ url: targetUrl }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const responseText = await response.text();

      // Check for Cloudflare / Security headers block
      if (
        response.status === 401 ||
        response.status === 403 ||
        responseText.includes('Missing security headers') ||
        responseText.includes('Just a moment...')
      ) {
        logger.warn('[InstaSaver] Blocked by security validation / Cloudflare challenge. Provider unavailable.');
        this.status = 'unavailable';
        this.statusReason = 'Security Header / Cloudflare Validation Required';
        return {
          success: false,
          provider: this.name,
          username: input.username,
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      if (!response.ok) {
        logger.warn(`[InstaSaver] HTTP ${response.status} returned`);
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
        logger.warn('[InstaSaver] Malformed response JSON from provider');
        return {
          success: false,
          provider: this.name,
          username: input.username,
          reason: 'PROVIDER_UNAVAILABLE',
        };
      }

      // Check for private account / not found
      if (data.isPrivate || data.error === 'PRIVATE_ACCOUNT') {
        return {
          success: false,
          provider: this.name,
          username: input.username,
          reason: 'PRIVATE_ACCOUNT',
        };
      }

      if (data.error === 'NO_STORIES' || (Array.isArray(data.items) && data.items.length === 0)) {
        return {
          success: true,
          provider: this.name,
          username: input.username,
          stories: [],
        };
      }

      const rawItems = data.items || data.stories || data.result || [];
      const stories = [];

      for (const item of rawItems) {
        if (!item) continue;
        const isVideo = Boolean(item.videoUrl || item.isVideo || item.type === 'video');
        const mediaUrl = item.videoUrl || item.imageUrl || item.url;
        if (!mediaUrl) continue;

        stories.push({
          type: isVideo ? 'video' : 'image',
          url: mediaUrl,
          thumbnail: item.thumbnail || item.thumbnailUrl || undefined,
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        });
      }

      return {
        success: true,
        provider: this.name,
        username: input.username,
        stories,
      };
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        logger.warn(`[InstaSaver] Request timed out after ${this.timeoutMs}ms`);
      } else {
        logger.warn(`[InstaSaver] Network/Execution error: ${err.message}`);
      }
      return {
        success: false,
        provider: this.name,
        username: input.username,
        reason: 'PROVIDER_UNAVAILABLE',
      };
    }
  }
}

module.exports = InstaSaverProvider;
