const express = require('express');
const { handleStoryRequest, handleProvidersStatus } = require('../controllers/storyController');

const router = express.Router();

// Story endpoint
router.post('/story', handleStoryRequest);

module.exports = router;
