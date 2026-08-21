const StoryProvider = require('./storyProvider');

class MockProvider extends StoryProvider {
  constructor(options = {}) {
    super();
    this.customResponses = options.customResponses || {};
  }

  setScenario(username, responseOrFn) {
    this.customResponses[username.toLowerCase()] = responseOrFn;
  }

  async getStories(username) {
    const key = username.toLowerCase();
    const mock = this.customResponses[key];

    if (mock) {
      if (typeof mock === 'function') {
        return mock(username);
      }
      if (mock.error) {
        const err = new Error(mock.message || 'Mock error');
        err.code = mock.error;
        err.statusCode = mock.statusCode || 500;
        throw err;
      }
      return mock;
    }

    // Default mock behavior for test accounts
    if (key === 'private_user') {
      const err = new Error('This Instagram account is private.');
      err.code = 'PRIVATE_ACCOUNT';
      err.statusCode = 403;
      throw err;
    }

    if (key === 'nonexistent_user_404') {
      const err = new Error('Instagram account was not found.');
      err.code = 'ACCOUNT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (key === 'timeout_user') {
      const err = new Error('Upstream request timed out.');
      err.code = 'FETCH_FAILED';
      err.statusCode = 504;
      throw err;
    }

    if (key === 'failure_user') {
      const err = new Error('Upstream source failure.');
      err.code = 'FETCH_FAILED';
      err.statusCode = 502;
      throw err;
    }

    if (key === 'no_stories_user') {
      return {
        success: true,
        username,
        isPublic: true,
        stories: [],
      };
    }

    // Default active public story with video & image
    return {
      success: true,
      username,
      isPublic: true,
      stories: [
        {
          type: 'video',
          url: 'https://instagram.fdbd1-3.fna.fbcdn.net/o1/v/t2/f2/m367/sample_story_video.mp4',
          thumbnail: 'https://instagram.fdbd1-3.fna.fbcdn.net/v/t51.82787-15/sample_thumb.jpg',
          timestamp: 1785900000,
        },
        {
          type: 'image',
          url: 'https://instagram.fdbd1-3.fna.fbcdn.net/v/t51.82787-15/sample_story_image.jpg',
          timestamp: 1785900500,
        },
      ],
    };
  }
}

module.exports = MockProvider;
