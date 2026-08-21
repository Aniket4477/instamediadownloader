const SaveClipProvider = require('./providers/saveclipProvider');
const InstaSaverProvider = require('./providers/instasaverProvider');
const config = require('../config/providers');
const logger = require('../utils/logger');

class StoryService {
  constructor(options = {}) {
    this.saveclip = options.saveclipProvider || new SaveClipProvider(config.saveclip);
    this.instasaver = options.instasaverProvider || new InstaSaverProvider(config.instasaver);
    
    // In-memory short-lived cache: Map<key, { data, expiresAt }>
    this.cache = new Map();
    this.cacheTtlMs = config.cache.ttlMs;
  }

  /**
   * Orchestrates the fallback story retrieval workflow.
   * 
   * @param {{ username: string, storyId?: string, normalizedUrl: string }} input
   * @returns {Promise<Object>}
   */
  async fetchPublicStories(input) {
    const cacheKey = `${input.username}:${input.storyId || 'all'}`;

    // ── 1. Check Short-lived Cache ───────────────────────────────────────────
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.info(`[Cache] Returning fresh cached result for ${input.username}`);
      return cached.data;
    }

    logger.info(`Trying provider: saveclip for ${input.username}`);

    // ── 2. Try Provider 1: SaveClip ─────────────────────────────────────────
    let result = null;
    try {
      result = await this.saveclip.getStories(input);
    } catch (err) {
      logger.warn(`SaveClip threw unexpected error: ${err.message}`);
    }

    if (result && result.success) {
      logger.info(`SaveClip succeeded for ${input.username}`);
      logger.info(`Returning ${result.stories ? result.stories.length : 0} media items`);
      this.setCache(cacheKey, result);
      return result;
    }

    if (result && result.reason === 'PRIVATE_ACCOUNT') {
      logger.info(`SaveClip identified account as private: ${input.username}`);
      const privateResponse = {
        success: false,
        error: 'PRIVATE_ACCOUNT',
        message: 'Only public Instagram accounts are supported.',
      };
      return privateResponse;
    }

    logger.info(`SaveClip failed for ${input.username}`);

    // ── 3. Try Provider 2: InstaSaver (Fallback) ─────────────────────────────
    logger.info(`Trying provider: instasaver for ${input.username}`);

    let instasaverResult = null;
    try {
      instasaverResult = await this.instasaver.getStories(input);
    } catch (err) {
      logger.warn(`InstaSaver threw unexpected error: ${err.message}`);
    }

    if (instasaverResult && instasaverResult.success) {
      logger.info(`InstaSaver succeeded for ${input.username}`);
      logger.info(`Returning ${instasaverResult.stories ? instasaverResult.stories.length : 0} media items`);
      this.setCache(cacheKey, instasaverResult);
      return instasaverResult;
    }

    if (instasaverResult && instasaverResult.reason === 'PRIVATE_ACCOUNT') {
      logger.info(`InstaSaver identified account as private: ${input.username}`);
      return {
        success: false,
        error: 'PRIVATE_ACCOUNT',
        message: 'Only public Instagram accounts are supported.',
      };
    }

    logger.info(`InstaSaver failed for ${input.username}`);

    // ── 4. Both Providers Failed ─────────────────────────────────────────────
    logger.warn(`All story providers failed for ${input.username}`);
    return {
      success: false,
      error: 'PROVIDERS_UNAVAILABLE',
      message: 'Unable to retrieve this public Story right now.',
    };
  }

  setCache(key, data) {
    if (this.cache.size > config.cache.maxEntries) {
      // Prune oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Health status for all registered providers
   */
  async getProvidersHealth() {
    const saveclipHealth = await this.saveclip.checkHealth();
    const instasaverHealth = await this.instasaver.checkHealth();

    return {
      saveclip: saveclipHealth,
      instasaver: instasaverHealth,
    };
  }
}

module.exports = StoryService;
