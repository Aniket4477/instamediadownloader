const StoryProvider = require('./storyProvider');

class FabulaProvider extends StoryProvider {
  constructor(options = {}) {
    super();
    this.timeoutMs = options.timeoutMs || parseInt(process.env.UPSTREAM_TIMEOUT_MS, 10) || 15000;
    this.baseUrl = options.baseUrl || 'https://api-ig.storiesig.info';
  }

  /**
   * Fetches public stories via the StoriesIG/Fabula upstream.
   * 
   * @param {string} username - Validated username
   * @returns {Promise<Object>} Formatted stories response
   */
  async getStories(username) {
    const userInfoUrl = `${this.baseUrl}/api/userInfoByUsername/${encodeURIComponent(username)}`;
    const storiesUrl = `${this.baseUrl}/api/story?url=${encodeURIComponent(`https://www.instagram.com/stories/${username}`)}`;

    try {
      // ── 1. Fetch User Information ──────────────────────────────────────────
      const userRes = await fetch(userInfoUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://storiesig.info/',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const userText = await userRes.text();

      // Detect Cloudflare / Bot Protection Challenge
      if (userRes.status === 403 || userText.includes('Just a moment...') || userText.includes('cf-browser-verification')) {
        const error = new Error('Upstream provider (StoriesIG) is protected by Cloudflare bot challenge and is refusing programmatic requests.');
        error.code = 'FETCH_FAILED';
        error.statusCode = 502;
        throw error;
      }

      if (userRes.status === 404 || userText.includes('User not found') || userText.includes('Not Found')) {
        const error = new Error('Instagram account was not found.');
        error.code = 'ACCOUNT_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      let userData;
      try {
        userData = JSON.parse(userText);
      } catch (e) {
        const error = new Error('Failed to parse upstream user response.');
        error.code = 'FETCH_FAILED';
        error.statusCode = 502;
        throw error;
      }

      // Check if account is private
      const user = userData?.result?.user || userData?.user || userData;
      if (user?.is_private || user?.isPrivate) {
        const error = new Error('This Instagram account is private.');
        error.code = 'PRIVATE_ACCOUNT';
        error.statusCode = 403;
        throw error;
      }

      // ── 2. Fetch Stories ───────────────────────────────────────────────────
      const storiesRes = await fetch(storiesUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://storiesig.info/',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const storiesText = await storiesRes.text();
      let storiesData;
      try {
        storiesData = JSON.parse(storiesText);
      } catch (e) {
        storiesData = { result: [] };
      }

      const rawItems = storiesData?.result || storiesData?.items || [];
      const stories = [];

      for (const item of rawItems) {
        if (!item) continue;

        const isVideo = Boolean(
          item.is_video || item.media_type === 2 || item.video_versions?.length || item.video_url
        );

        const videoUrl =
          item.video_url || (item.video_versions && item.video_versions[0]?.url) || null;
        const imageUrl =
          item.display_url ||
          (item.image_versions2 && item.image_versions2.candidates?.[0]?.url) ||
          item.thumbnail_url ||
          null;

        const timestamp = item.taken_at || item.created_time || Math.floor(Date.now() / 1000);

        if (isVideo && videoUrl) {
          stories.push({
            type: 'video',
            url: videoUrl,
            thumbnail: imageUrl || undefined,
            timestamp: Number(timestamp),
          });
        } else if (imageUrl) {
          stories.push({
            type: 'image',
            url: imageUrl,
            timestamp: Number(timestamp),
          });
        }
      }

      return {
        success: true,
        username,
        isPublic: true,
        stories,
      };

    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        const timeoutErr = new Error('Upstream request timed out.');
        timeoutErr.code = 'FETCH_FAILED';
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw err;
    }
  }
}

module.exports = FabulaProvider;
