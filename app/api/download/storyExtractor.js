const puppeteer = require('puppeteer-core');

const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function unwrapDirectCdnUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    if (
      url.includes('igram.world/get') ||
      url.includes('storiesig.info/get') ||
      url.includes('anonyig.com/get') ||
      url.includes('instasaver.io/api/media/proxy')
    ) {
      const parsed = new URL(url);
      const inner = parsed.searchParams.get('uri');
      if (inner && inner.startsWith('http')) return inner;
    }
    if (url.includes('indown.io/fetch')) {
      const parsed = new URL(url);
      const inner = parsed.searchParams.get('url');
      if (inner && inner.startsWith('http')) return inner;
    }
  } catch {
    // fallback
  }
  return url;
}

function isInstagramCdn(url) {
  if (!url) return false;
  return url.includes('cdninstagram.com') || url.includes('fbcdn.net');
}

/**
 * Provider 1 (Primary): StorySaver.net
 * https://www.storysaver.net/en/
 */
async function extractViaStorySaver(page, username) {
  try {
    console.log(`[Provider: StorySaver.net (Primary)] Querying @${username}...`);
    await page.goto('https://www.storysaver.net/en/', { waitUntil: 'networkidle2', timeout: 20000 });

    const input = await page.$('#text_url, input[name="url"], input[type="text"]');
    if (!input) return [];
    await input.type(username, { delay: 20 });

    await page.evaluate(() => {
      const btn = document.querySelector('button.button, input[type="submit"], button[type="submit"]');
      if (btn) btn.click();
    });

    for (let sec = 0; sec < 10; sec++) {
      await new Promise((r) => setTimeout(r, 1000));
      const hasResults = await page.evaluate(() => {
        return document.querySelectorAll('video, a[download], a.download_button, a[href*="cdninstagram"]').length;
      });
      if (hasResults > 0) {
        console.log(`[StorySaver.net] Found items after ${sec + 1}s!`);
        break;
      }
    }

    const items = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll('video, a[download], a.download_button, a[href*="cdninstagram"]').forEach((e) => {
        const u = e.src || e.href;
        if (u) list.push(u);
      });
      return list;
    });

    const stories = [];
    const seen = new Set();
    for (const raw of items) {
      const clean = unwrapDirectCdnUrl(raw);
      if (isInstagramCdn(clean) && !seen.has(clean)) {
        seen.add(clean);
        stories.push({
          type: clean.includes('.mp4') ? 'video' : 'image',
          url: clean,
          thumbnail: clean,
        });
      }
    }

    console.log(`[StorySaver.net] Extracted ${stories.length} stories.`);
    return stories;
  } catch (err) {
    console.warn('[StorySaver.net Error]:', err.message);
    return [];
  }
}

/**
 * Provider 2 (Fallback 1): IGram.world
 * https://igram.world/en1/story-saver
 */
async function extractViaIGram(page, username) {
  try {
    console.log(`[Provider: IGram.world (Fallback 1)] Querying @${username}...`);
    await page.goto('https://igram.world/en1/story-saver', { waitUntil: 'networkidle2', timeout: 20000 });

    const input = await page.$('#search-form-input, input[name="url"], input[type="text"]');
    if (!input) return [];
    await input.type(username, { delay: 20 });

    await page.evaluate(() => {
      const btn = document.querySelector('button.search-form__button, button[type="submit"]');
      if (btn) btn.click();
    });

    for (let sec = 0; sec < 12; sec++) {
      await new Promise((r) => setTimeout(r, 1000));
      const count = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="igram.world/get"], a.button__download, a[download]').length;
      });
      if (count > 0) {
        console.log(`[IGram.world] Found ${count} story download links after ${sec + 1}s!`);
        break;
      }
    }

    const items = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll('a[href*="igram.world/get"], a.button__download, a[download]').forEach((a) => {
        if (a.href) list.push(a.href);
      });
      return list;
    });

    const stories = [];
    const seen = new Set();
    for (const raw of items) {
      const clean = unwrapDirectCdnUrl(raw);
      if (isInstagramCdn(clean) && !seen.has(clean)) {
        seen.add(clean);
        stories.push({
          type: clean.includes('.mp4') ? 'video' : 'image',
          url: clean,
          thumbnail: clean,
        });
      }
    }

    console.log(`[IGram.world] Extracted ${stories.length} stories.`);
    return stories;
  } catch (err) {
    console.warn('[IGram.world Error]:', err.message);
    return [];
  }
}

/**
 * Provider 3 (Fallback 2): InstaSaver.io
 * https://instasaver.io/en/story-viewer/
 */
async function extractViaInstaSaver(page, username) {
  try {
    console.log(`[Provider: InstaSaver.io (Fallback 2)] Querying @${username}...`);
    const interceptedVideoUrls = [];
    const responseHandler = async (res) => {
      const u = res.url();
      if (
        u.includes('.mp4') ||
        (u.includes('proxy?') && u.includes('.mp4')) ||
        (u.includes('download=1') && u.includes('.mp4'))
      ) {
        interceptedVideoUrls.push(unwrapDirectCdnUrl(u));
      }
    };

    page.on('response', responseHandler);
    await page.goto('https://instasaver.io/en/story-viewer/', { waitUntil: 'networkidle2', timeout: 20000 });

    const inputSelector = 'input[type="text"], input[name="url"], input[placeholder*="username"], input[placeholder*="Instagram"]';
    await page.waitForSelector(inputSelector, { timeout: 8000 });
    await page.type(inputSelector, username, { delay: 20 });

    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a.btn')];
      const submitBtn = btns.find(
        (b) =>
          b.innerText &&
          (b.innerText.toLowerCase().includes('view') ||
            b.innerText.toLowerCase().includes('download') ||
            b.innerText.toLowerCase().includes('search'))
      );
      if (submitBtn) submitBtn.click();
    });

    let btnCount = 0;
    for (let sec = 0; sec < 12; sec++) {
      await new Promise((r) => setTimeout(r, 1000));
      btnCount = await page.evaluate(() => document.querySelectorAll('.grid button').length);
      if (btnCount > 0) {
        console.log(`[InstaSaver.io] Found ${btnCount} active story buttons after ${sec + 1}s!`);
        break;
      }
    }

    if (btnCount > 0) {
      for (let i = 0; i < btnCount; i++) {
        await page.evaluate((idx) => {
          const btns = document.querySelectorAll('.grid button');
          if (btns[idx]) btns[idx].click();
        }, i);
        await new Promise((r) => setTimeout(r, 1600));
      }
    }

    page.off('response', responseHandler);

    const cardThumbnails = await page.evaluate(() => {
      const thumbs = [];
      document.querySelectorAll('.grid > div').forEach((card) => {
        const img = card.querySelector('img');
        if (img?.src) thumbs.push(img.src);
      });
      return thumbs;
    });

    const stories = [];
    const seen = new Set();
    for (let i = 0; i < interceptedVideoUrls.length; i++) {
      const vidUrl = interceptedVideoUrls[i];
      if (isInstagramCdn(vidUrl) && !seen.has(vidUrl)) {
        seen.add(vidUrl);
        const thumb = cardThumbnails[i] ? unwrapDirectCdnUrl(cardThumbnails[i]) : undefined;
        stories.push({
          type: 'video',
          url: vidUrl,
          thumbnail: thumb,
        });
      }
    }

    if (stories.length === 0) {
      for (const thumb of cardThumbnails) {
        const unwrapped = unwrapDirectCdnUrl(thumb);
        if (isInstagramCdn(unwrapped) && !seen.has(unwrapped)) {
          seen.add(unwrapped);
          stories.push({
            type: 'image',
            url: unwrapped,
            thumbnail: unwrapped,
          });
        }
      }
    }

    console.log(`[InstaSaver.io] Extracted ${stories.length} stories.`);
    return stories;
  } catch (err) {
    console.warn('[InstaSaver.io Error]:', err.message);
    return [];
  }
}

/**
 * Provider 4 (Fallback 3): InDown.io
 * https://indown.io/insta-stories-download
 */
async function extractViaInDown(page, username) {
  try {
    console.log(`[Provider: InDown.io (Fallback 3)] Querying @${username}...`);
    const storyUrl = `https://www.instagram.com/stories/${username}/`;
    await page.goto('https://indown.io/insta-stories-download', { waitUntil: 'networkidle2', timeout: 20000 });

    const input = await page.$('#link, input[name="link"]');
    if (!input) return [];
    await input.type(storyUrl, { delay: 20 });
    await page.click('#get');

    for (let sec = 0; sec < 12; sec++) {
      await new Promise((r) => setTimeout(r, 1000));
      const count = await page.evaluate(() => {
        return document.querySelectorAll('video, a[download], a.btn-primary[href*="cdn"], a.btn-primary[href*="fetch"]').length;
      });
      if (count > 0) {
        console.log(`[InDown.io] Found ${count} items after ${sec + 1}s!`);
        break;
      }
    }

    const items = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll('video, a[download], a.btn-primary[href*="cdn"], a.btn-primary[href*="fetch"]').forEach((el) => {
        const u = el.src || el.href;
        if (u) list.push(u);
      });
      return list;
    });

    const stories = [];
    const seen = new Set();
    for (const raw of items) {
      const clean = unwrapDirectCdnUrl(raw);
      if (isInstagramCdn(clean) && !seen.has(clean)) {
        seen.add(clean);
        stories.push({
          type: clean.includes('.mp4') ? 'video' : 'image',
          url: clean,
          thumbnail: clean,
        });
      }
    }

    console.log(`[InDown.io] Extracted ${stories.length} stories.`);
    return stories;
  } catch (err) {
    console.warn('[InDown.io Error]:', err.message);
    return [];
  }
}

/**
 * Main Story Extraction Dispatcher with Resilient Multi-Provider Fallback Cascade
 */
async function extractStoriesViaBrowser(usernameOrUrl) {
  let cleanInput = usernameOrUrl.trim();
  let username = 'user';
  let targetStoryId = null;

  if (cleanInput.includes('instagram.com/stories/')) {
    const match = cleanInput.match(/instagram\.com\/stories\/([^/?#]+)(?:\/(\d+))?/i);
    if (match) {
      username = match[1];
      if (match[2]) targetStoryId = match[2];
    }
  } else if (cleanInput.includes('instagram.com/')) {
    const match = cleanInput.match(/instagram\.com\/([^/?#]+)/i);
    if (match && !['p', 'reel', 'reels', 'tv'].includes(match[1].toLowerCase())) {
      username = match[1];
    }
  } else {
    username = cleanInput.replace(/^@/, '');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    let storiesList = [];

    // 1. Primary: StorySaver.net
    storiesList = await extractViaStorySaver(page, username);

    // 2. Fallback 1: IGram.world
    if (storiesList.length === 0) {
      console.log(`[Cascade] Failing over to Fallback 1 (IGram.world) for @${username}...`);
      storiesList = await extractViaIGram(page, username);
    }

    // 3. Fallback 2: InstaSaver.io
    if (storiesList.length === 0) {
      console.log(`[Cascade] Failing over to Fallback 2 (InstaSaver.io) for @${username}...`);
      storiesList = await extractViaInstaSaver(page, username);
    }

    // 4. Fallback 3: InDown.io
    if (storiesList.length === 0) {
      console.log(`[Cascade] Failing over to Fallback 3 (InDown.io) for @${username}...`);
      storiesList = await extractViaInDown(page, username);
    }

    // If targetStoryId was specified in the link, prioritize it to the front
    if (targetStoryId && storiesList.length > 1) {
      const matchIdx = storiesList.findIndex(
        (s) => (s.url && s.url.includes(targetStoryId)) || (s.thumbnail && s.thumbnail.includes(targetStoryId))
      );
      if (matchIdx > 0) {
        const matched = storiesList.splice(matchIdx, 1)[0];
        storiesList.unshift(matched);
      }
    }

    return {
      success: true,
      username,
      count: storiesList.length,
      stories: storiesList,
    };
  } catch (err) {
    console.error('[Story Cascade Error]:', err.message);
    return { success: false, error: 'FETCH_FAILED', message: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  extractStoriesViaBrowser,
  unwrapDirectCdnUrl,
};
