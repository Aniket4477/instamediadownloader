const express = require('express');
const { getPublicStories } = require('../controllers/instagramController');

const router = express.Router();

/**
 * @route   GET /api/instagram/story/:username
 * @desc    Fetch active public stories for an Instagram user
 * @access  Public
 */
router.get('/story/:username', getPublicStories);

module.exports = router;
