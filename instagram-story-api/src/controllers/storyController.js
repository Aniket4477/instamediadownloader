const { parseAndValidateInstagramInput } = require('../utils/instagramUrl');
const StoryService = require('../services/storyService');
const logger = require('../utils/logger');

const defaultStoryService = new StoryService();

/**
 * Controller: Handles POST /api/instagram/story
 */
async function handleStoryRequest(req, res, next) {
  try {
    logger.info('Request received');

    const rawUrl = req.body?.url;
    if (!rawUrl) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: 'The "url" field is required in the request body.',
      });
    }

    // ── 1. Validate and Parse Input ──────────────────────────────────────────
    const validation = parseAndValidateInstagramInput(rawUrl);
    if (!validation.isValid) {
      logger.warn(`Input validation failed: ${validation.error}`);
      return res.status(400).json({
        success: false,
        error: 'INVALID_INPUT',
        message: validation.error || 'Please provide a valid public Instagram story or profile URL.',
      });
    }

    logger.info(`Input validated: @${validation.username}`);

    // ── 2. Invoke Story Service (with Fallback) ──────────────────────────────
    const storyService = req.storyService || defaultStoryService;
    const result = await storyService.fetchPublicStories(validation);

    // ── 3. Map Result to HTTP Status & JSON ──────────────────────────────────
    if (result.success) {
      return res.status(200).json(result);
    }

    if (result.error === 'PRIVATE_ACCOUNT') {
      return res.status(403).json(result);
    }

    if (result.error === 'PROVIDERS_UNAVAILABLE') {
      return res.status(503).json(result);
    }

    return res.status(500).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller: Handles GET /api/providers/status
 */
async function handleProvidersStatus(req, res, next) {
  try {
    const storyService = req.storyService || defaultStoryService;
    const health = await storyService.getProvidersHealth();
    return res.status(200).json(health);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  handleStoryRequest,
  handleProvidersStatus,
  defaultStoryService,
};
