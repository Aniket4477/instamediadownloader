/**
 * Abstract Story Provider Base Interface.
 * Defines the contract that all Instagram Story providers must implement.
 */
class StoryProvider {
  /**
   * Fetches public stories for a given username.
   * 
   * @param {string} username - Validated Instagram username
   * @returns {Promise<{
   *   success: boolean,
   *   username: string,
   *   isPublic: boolean,
   *   stories: Array<{
   *     type: 'video' | 'image',
   *     url: string,
   *     thumbnail?: string,
   *     timestamp: number
   *   }>
   * }>}
   */
  async getStories(username) {
    throw new Error('getStories method must be implemented by subclass.');
  }
}

module.exports = StoryProvider;
