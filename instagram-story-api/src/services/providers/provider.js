/**
 * StoryProvider Base Interface.
 * Standard contract for all public Instagram Story retrieval providers.
 */
class StoryProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.status = 'available';
  }

  /**
   * Fetches public stories for a given validated input object.
   * 
   * @param {{ username: string, storyId?: string, normalizedUrl: string }} input
   * @returns {Promise<{
   *   success: boolean,
   *   provider: string,
   *   username: string,
   *   stories?: Array<{
   *     type: 'video' | 'image',
   *     url: string,
   *     thumbnail?: string,
   *     mimeType: string,
   *     timestamp?: number
   *   }>,
   *   reason?: 'NO_STORIES' | 'PRIVATE_ACCOUNT' | 'ACCOUNT_NOT_FOUND' | 'PROVIDER_UNAVAILABLE' | 'BLOCKED'
   * }>}
   */
  async getStories(input) {
    throw new Error(`getStories method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Health check method for provider status
   * @returns {Promise<{ available: boolean, reason?: string }>}
   */
  async checkHealth() {
    return {
      available: this.status === 'available',
      reason: this.statusReason || undefined,
    };
  }
}

module.exports = StoryProvider;
