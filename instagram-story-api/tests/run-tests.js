const assert = require('assert');
const http = require('http');
const express = require('express');
const instagramRoutes = require('../src/routes/instagram');
const { errorHandler } = require('../src/middleware/errorHandler');
const MockProvider = require('../src/services/instagram/mockProvider');
const FabulaProvider = require('../src/services/instagram/fabulaProvider');
const { validateInstagramUsername } = require('../src/utils/validation');

let passedTests = 0;
let failedTests = 0;

function logTest(num, name, passed, details = '') {
  if (passed) {
    console.log(`✅ Test ${num}: ${name} — PASSED`);
    passedTests++;
  } else {
    console.error(`❌ Test ${num}: ${name} — FAILED. ${details}`);
    failedTests++;
  }
}

// Create isolated Express test app
function createTestApp(provider) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.storyProvider = provider;
    next();
  });
  app.use('/api/instagram', instagramRoutes);
  app.use(errorHandler);
  return app;
}

// HTTP request helper
function makeRequest(server, path) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runSuite() {
  console.log('====================================================');
  console.log('  INSTAGRAM PUBLIC STORY DOWNLOADER TEST SUITE');
  console.log('====================================================\n');

  const mockProvider = new MockProvider();
  const app = createTestApp(mockProvider);
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));

  try {
    // ── 1. Public account with active Story ──
    {
      const res = await makeRequest(server, '/api/instagram/story/public_creator');
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        res.data.isPublic === true &&
        Array.isArray(res.data.stories) &&
        res.data.stories.length > 0;
      logTest(1, 'Public account with active Story', pass);
    }

    // ── 2. Public account with no Story ──
    {
      const res = await makeRequest(server, '/api/instagram/story/no_stories_user');
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        res.data.isPublic === true &&
        Array.isArray(res.data.stories) &&
        res.data.stories.length === 0;
      logTest(2, 'Public account with no Story', pass);
    }

    // ── 3. Private account ──
    {
      const res = await makeRequest(server, '/api/instagram/story/private_user');
      const pass =
        res.status === 403 &&
        res.data.success === false &&
        res.data.error === 'PRIVATE_ACCOUNT' &&
        res.data.message === 'This Instagram account is private.';
      logTest(3, 'Private account rejection', pass);
    }

    // ── 4. Invalid username ──
    {
      const res = await makeRequest(server, '/api/instagram/story/invalid..username$$');
      const pass =
        res.status === 400 &&
        res.data.success === false &&
        res.data.error === 'INVALID_USERNAME';
      logTest(4, 'Invalid username format validation', pass);
    }

    // ── 5. Nonexistent account ──
    {
      const res = await makeRequest(server, '/api/instagram/story/nonexistent_user_404');
      const pass =
        res.status === 404 &&
        res.data.success === false &&
        res.data.error === 'ACCOUNT_NOT_FOUND' &&
        res.data.message === 'Instagram account was not found.';
      logTest(5, 'Nonexistent account error (404)', pass);
    }

    // ── 6. Upstream timeout ──
    {
      const res = await makeRequest(server, '/api/instagram/story/timeout_user');
      const pass =
        res.status === 504 &&
        res.data.success === false &&
        res.data.error === 'FETCH_FAILED';
      logTest(6, 'Upstream timeout handling (504)', pass);
    }

    // ── 7. Upstream failure ──
    {
      const res = await makeRequest(server, '/api/instagram/story/failure_user');
      const pass =
        res.status === 502 &&
        res.data.success === false &&
        res.data.error === 'FETCH_FAILED';
      logTest(7, 'Upstream failure handling (502)', pass);
    }

    // ── 8. Malformed response from upstream ──
    {
      mockProvider.setScenario('malformed_user', () => {
        const err = new Error('Failed to parse upstream response');
        err.code = 'FETCH_FAILED';
        err.statusCode = 502;
        throw err;
      });
      const res = await makeRequest(server, '/api/instagram/story/malformed_user');
      const pass =
        res.status === 502 &&
        res.data.success === false &&
        res.data.error === 'FETCH_FAILED';
      logTest(8, 'Malformed upstream response handling', pass);
    }

    // ── 9. Multiple Story items ──
    {
      mockProvider.setScenario('multi_story_user', {
        success: true,
        username: 'multi_story_user',
        isPublic: true,
        stories: [
          { type: 'image', url: 'https://cdn.example.com/s1.jpg', timestamp: 100 },
          { type: 'video', url: 'https://cdn.example.com/s2.mp4', thumbnail: 'https://cdn.example.com/t2.jpg', timestamp: 200 },
          { type: 'image', url: 'https://cdn.example.com/s3.jpg', timestamp: 300 },
        ],
      });
      const res = await makeRequest(server, '/api/instagram/story/multi_story_user');
      const pass =
        res.status === 200 &&
        res.data.stories.length === 3 &&
        res.data.stories[0].type === 'image' &&
        res.data.stories[1].type === 'video' &&
        res.data.stories[2].type === 'image';
      logTest(9, 'Multiple Story items parsing', pass);
    }

    // ── 10. Video Story ──
    {
      mockProvider.setScenario('video_story_user', {
        success: true,
        username: 'video_story_user',
        isPublic: true,
        stories: [
          {
            type: 'video',
            url: 'https://cdn.example.com/video.mp4',
            thumbnail: 'https://cdn.example.com/thumb.jpg',
            timestamp: 1785900000,
          },
        ],
      });
      const res = await makeRequest(server, '/api/instagram/story/video_story_user');
      const story = res.data.stories?.[0];
      const pass =
        res.status === 200 &&
        story &&
        story.type === 'video' &&
        story.url.endsWith('.mp4') &&
        Boolean(story.thumbnail);
      logTest(10, 'Video Story structure and metadata', pass);
    }

    // ── 11. Image Story ──
    {
      mockProvider.setScenario('image_story_user', {
        success: true,
        username: 'image_story_user',
        isPublic: true,
        stories: [
          {
            type: 'image',
            url: 'https://cdn.example.com/image.jpg',
            timestamp: 1785900000,
          },
        ],
      });
      const res = await makeRequest(server, '/api/instagram/story/image_story_user');
      const story = res.data.stories?.[0];
      const pass =
        res.status === 200 &&
        story &&
        story.type === 'image' &&
        story.url.endsWith('.jpg');
      logTest(11, 'Image Story structure and metadata', pass);
    }

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  console.log(`  RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
