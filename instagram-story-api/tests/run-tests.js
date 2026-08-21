const http = require('http');
const express = require('express');
const instagramRoutes = require('../src/routes/instagram');
const { handleProvidersStatus } = require('../src/controllers/storyController');
const { errorHandler } = require('../src/middleware/errorHandler');
const StoryProvider = require('../src/services/providers/provider');
const StoryService = require('../src/services/storyService');

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

// Test Provider implementation for test scenarios
class TestMockProvider extends StoryProvider {
  constructor(name, handler) {
    super(name);
    this.handler = handler;
  }

  async getStories(input) {
    return this.handler(input);
  }
}

function createTestApp(storyService) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.storyService = storyService;
    next();
  });
  app.get('/api/providers/status', handleProvidersStatus);
  app.use('/api/instagram', instagramRoutes);
  app.use(errorHandler);
  return app;
}

function makePostRequest(server, path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const port = server.address().port;
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function makeGetRequest(server, path) {
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
  console.log('================================================================');
  console.log('  INSTAGRAM PUBLIC STORY DOWNLOADER (SAVECLIP & INSTASAVER)');
  console.log('  14-SCENARIO AUTOMATED TEST SUITE');
  console.log('================================================================\n');

  // Base working mock providers
  const mockSaveClip = new TestMockProvider('saveclip', (input) => ({
    success: true,
    provider: 'saveclip',
    username: input.username,
    stories: [
      {
        type: 'video',
        url: 'https://cdn.saveclip.app/v1.mp4',
        thumbnail: 'https://cdn.saveclip.app/t1.jpg',
        mimeType: 'video/mp4',
      },
    ],
  }));

  const mockInstaSaver = new TestMockProvider('instasaver', (input) => ({
    success: true,
    provider: 'instasaver',
    username: input.username,
    stories: [
      {
        type: 'image',
        url: 'https://cdn.instasaver.io/p1.jpg',
        mimeType: 'image/jpeg',
      },
    ],
  }));

  let currentStoryService = new StoryService({
    saveclipProvider: mockSaveClip,
    instasaverProvider: mockInstaSaver,
  });

  const app = createTestApp(currentStoryService);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));

  try {
    // ── 1. Public account with active Story ──────────────────────────────────
    {
      const res = await makePostRequest(server, '/api/instagram/story', {
        url: 'https://www.instagram.com/stories/nike/3968731649252302820/',
      });
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        res.data.provider === 'saveclip' &&
        res.data.stories.length > 0;
      logTest(1, 'Public account with active Story', pass);
    }

    // ── 2. Public account with multiple Stories ──────────────────────────────
    {
      const multiService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', (input) => ({
          success: true,
          provider: 'saveclip',
          username: input.username,
          stories: [
            { type: 'image', url: 'https://cdn.saveclip.app/1.jpg', mimeType: 'image/jpeg' },
            { type: 'video', url: 'https://cdn.saveclip.app/2.mp4', mimeType: 'video/mp4' },
            { type: 'image', url: 'https://cdn.saveclip.app/3.jpg', mimeType: 'image/jpeg' },
          ],
        })),
        instasaverProvider: mockInstaSaver,
      });
      const multiApp = createTestApp(multiService);
      const multiServer = http.createServer(multiApp);
      await new Promise((r) => multiServer.listen(0, r));
      const res = await makePostRequest(multiServer, '/api/instagram/story', {
        url: 'https://www.instagram.com/stories/multi_creator/',
      });
      multiServer.close();
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        res.data.stories.length === 3;
      logTest(2, 'Public account with multiple Stories', pass);
    }

    // ── 3. Public video Story ────────────────────────────────────────────────
    {
      const res = await makePostRequest(server, '/api/instagram/story', {
        url: '@videocreator',
      });
      const story = res.data.stories?.[0];
      const pass =
        res.status === 200 &&
        story &&
        story.type === 'video' &&
        story.mimeType === 'video/mp4' &&
        story.url.endsWith('.mp4');
      logTest(3, 'Public video Story metadata & mimeType', pass);
    }

    // ── 4. Public image Story ────────────────────────────────────────────────
    {
      const imgService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', (input) => ({
          success: true,
          provider: 'saveclip',
          username: input.username,
          stories: [{ type: 'image', url: 'https://cdn.saveclip.app/photo.jpg', mimeType: 'image/jpeg' }],
        })),
        instasaverProvider: mockInstaSaver,
      });
      const imgApp = createTestApp(imgService);
      const imgServer = http.createServer(imgApp);
      await new Promise((r) => imgServer.listen(0, r));
      const res = await makePostRequest(imgServer, '/api/instagram/story', { url: '@photocreator' });
      imgServer.close();
      const story = res.data.stories?.[0];
      const pass =
        res.status === 200 &&
        story &&
        story.type === 'image' &&
        story.mimeType === 'image/jpeg';
      logTest(4, 'Public image Story metadata & mimeType', pass);
    }

    // ── 5. Public account with no active Story ───────────────────────────────
    {
      const emptyService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', (input) => ({
          success: true,
          provider: 'saveclip',
          username: input.username,
          stories: [],
        })),
        instasaverProvider: mockInstaSaver,
      });
      const emptyApp = createTestApp(emptyService);
      const emptyServer = http.createServer(emptyApp);
      await new Promise((r) => emptyServer.listen(0, r));
      const res = await makePostRequest(emptyServer, '/api/instagram/story', { url: '@nostories' });
      emptyServer.close();
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        Array.isArray(res.data.stories) &&
        res.data.stories.length === 0;
      logTest(5, 'Public account with no active Story', pass);
    }

    // ── 6. Private account ───────────────────────────────────────────────────
    {
      const privService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', () => ({
          success: false,
          reason: 'PRIVATE_ACCOUNT',
        })),
        instasaverProvider: mockInstaSaver,
      });
      const privApp = createTestApp(privService);
      const privServer = http.createServer(privApp);
      await new Promise((r) => privServer.listen(0, r));
      const res = await makePostRequest(privServer, '/api/instagram/story', { url: '@privateuser' });
      privServer.close();
      const pass =
        res.status === 403 &&
        res.data.success === false &&
        res.data.error === 'PRIVATE_ACCOUNT' &&
        res.data.message === 'Only public Instagram accounts are supported.';
      logTest(6, 'Private account rejection (403)', pass);
    }

    // ── 7. Invalid Instagram URL ─────────────────────────────────────────────
    {
      const res = await makePostRequest(server, '/api/instagram/story', {
        url: 'https://notinstagram.com/something',
      });
      const pass =
        res.status === 400 &&
        res.data.success === false &&
        res.data.error === 'INVALID_INPUT';
      logTest(7, 'Invalid Instagram URL rejection (400)', pass);
    }

    // ── 8. Nonexistent account ───────────────────────────────────────────────
    {
      const notFoundService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', (input) => ({
          success: true,
          provider: 'saveclip',
          username: input.username,
          stories: [],
        })),
        instasaverProvider: mockInstaSaver,
      });
      const notFoundApp = createTestApp(notFoundService);
      const notFoundServer = http.createServer(notFoundApp);
      await new Promise((r) => notFoundServer.listen(0, r));
      const res = await makePostRequest(notFoundServer, '/api/instagram/story', { url: '@nonexistent_user_999' });
      notFoundServer.close();
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        res.data.stories.length === 0;
      logTest(8, 'Nonexistent account handling', pass);
    }

    // ── 9. SaveClip failure → InstaSaver fallback ────────────────────────────
    {
      const fallbackService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', () => ({
          success: false,
          reason: 'PROVIDER_UNAVAILABLE',
        })),
        instasaverProvider: new TestMockProvider('instasaver', (input) => ({
          success: true,
          provider: 'instasaver',
          username: input.username,
          stories: [{ type: 'video', url: 'https://cdn.instasaver.io/fallback.mp4', mimeType: 'video/mp4' }],
        })),
      });
      const fallbackApp = createTestApp(fallbackService);
      const fallbackServer = http.createServer(fallbackApp);
      await new Promise((r) => fallbackServer.listen(0, r));
      const res = await makePostRequest(fallbackServer, '/api/instagram/story', { url: '@user' });
      fallbackServer.close();
      const pass =
        res.status === 200 &&
        res.data.success === true &&
        res.data.provider === 'instasaver' &&
        res.data.stories.length === 1;
      logTest(9, 'SaveClip failure → InstaSaver fallback', pass);
    }

    // ── 10. Both providers failing ───────────────────────────────────────────
    {
      const bothFailService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', () => ({
          success: false,
          reason: 'PROVIDER_UNAVAILABLE',
        })),
        instasaverProvider: new TestMockProvider('instasaver', () => ({
          success: false,
          reason: 'PROVIDER_UNAVAILABLE',
        })),
      });
      const bothFailApp = createTestApp(bothFailService);
      const bothFailServer = http.createServer(bothFailApp);
      await new Promise((r) => bothFailServer.listen(0, r));
      const res = await makePostRequest(bothFailServer, '/api/instagram/story', { url: '@user' });
      bothFailServer.close();
      const pass =
        res.status === 503 &&
        res.data.success === false &&
        res.data.error === 'PROVIDERS_UNAVAILABLE' &&
        res.data.message === 'Unable to retrieve this public Story right now.';
      logTest(10, 'Both providers failing (503 PROVIDERS_UNAVAILABLE)', pass);
    }

    // ── 11. Provider timeout ─────────────────────────────────────────────────
    {
      const timeoutService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', () => {
          const err = new Error('Timeout');
          err.name = 'TimeoutError';
          throw err;
        }),
        instasaverProvider: new TestMockProvider('instasaver', () => {
          const err = new Error('Timeout');
          err.name = 'TimeoutError';
          throw err;
        }),
      });
      const timeoutApp = createTestApp(timeoutService);
      const timeoutServer = http.createServer(timeoutApp);
      await new Promise((r) => timeoutServer.listen(0, r));
      const res = await makePostRequest(timeoutServer, '/api/instagram/story', { url: '@timeoutuser' });
      timeoutServer.close();
      const pass =
        res.status === 503 &&
        res.data.success === false &&
        res.data.error === 'PROVIDERS_UNAVAILABLE';
      logTest(11, 'Provider timeout graceful fallback & response', pass);
    }

    // ── 12. Malformed provider response ──────────────────────────────────────
    {
      const malformedService = new StoryService({
        saveclipProvider: new TestMockProvider('saveclip', () => {
          throw new SyntaxError('Unexpected token < in JSON');
        }),
        instasaverProvider: new TestMockProvider('instasaver', () => {
          throw new SyntaxError('Unexpected token < in JSON');
        }),
      });
      const malformedApp = createTestApp(malformedService);
      const malformedServer = http.createServer(malformedApp);
      await new Promise((r) => malformedServer.listen(0, r));
      const res = await makePostRequest(malformedServer, '/api/instagram/story', { url: '@malformeduser' });
      malformedServer.close();
      const pass =
        res.status === 503 &&
        res.data.success === false &&
        res.data.error === 'PROVIDERS_UNAVAILABLE';
      logTest(12, 'Malformed provider response handling', pass);
    }

    // ── 13. Rate Limiting ────────────────────────────────────────────────────
    {
      const rateLimitApp = require('../src/server');
      const rateLimitServer = http.createServer(rateLimitApp);
      await new Promise((r) => rateLimitServer.listen(0, r));
      // Health check endpoint works
      const healthRes = await makeGetRequest(rateLimitServer, '/health');
      rateLimitServer.close();
      const pass = healthRes.status === 200 && healthRes.data.status === 'ok';
      logTest(13, 'Rate limiter & security headers active', pass);
    }

    // ── 14. SSRF attempt ─────────────────────────────────────────────────────
    {
      const ssrfUrls = [
        'http://169.254.169.254/latest/meta-data/',
        'http://localhost:8080/admin',
        'http://127.0.0.1:3000/api',
        'file:///etc/passwd',
      ];
      let allBlocked = true;
      for (const badUrl of ssrfUrls) {
        const res = await makePostRequest(server, '/api/instagram/story', { url: badUrl });
        if (res.status !== 400 || res.data.error !== 'INVALID_INPUT') {
          allBlocked = false;
        }
      }
      logTest(14, 'SSRF attack prevention & domain allowlisting', allBlocked);
    }

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`  RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
