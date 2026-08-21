const { validateInstagramUsername } = require('../utils/validation');
const FabulaProvider = require('../services/instagram/fabulaProvider');
const MockProvider = require('../services/instagram/mockProvider');

// Provider factory
function getProvider() {
  const providerType = (process.env.STORY_PROVIDER || 'fabula').toLowerCase();
  if (providerType === 'mock') {
    return new MockProvider();
  }
  return new FabulaProvider();
}

/**
 * Controller to fetch public stories for a given username.
 * Route: GET /api/instagram/story/:username
 */
async function getPublicStories(req, res, next) {
  try {
    const rawUsername = req.params.username;

    // ── 1. Validate Username ────────────────────────────────────────────────
    const validation = validateInstagramUsername(rawUsername);
    if (!validation.isValid) {
      const error = new Error(validation.error);
      error.code = 'INVALID_USERNAME';
      error.statusCode = 400;
      return next(error);
    }

    const username = validation.cleanedUsername;

    // ── 2. Invoke Story Provider ────────────────────────────────────────────
    const provider = req.storyProvider || getProvider();
    const result = await provider.getStories(username);

    // ── 3. Return Standardized Success Response ─────────────────────────────
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPublicStories,
  getProvider,
};
