import puppeteer from 'puppeteer-core';
import fs from 'fs';

/**
 * Resolves the appropriate Chromium executable path and launch args
 * based on whether running in Vercel/Linux serverless or local Windows/macOS.
 */
export async function getChromiumConfig() {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isVercel) {
    try {
      const chromiumMod = await import('@sparticuz/chromium');
      const chromium = chromiumMod.default || chromiumMod;
      const executablePath = await chromium.executablePath();
      return {
        executablePath,
        args: chromium.args || [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
        headless: true,
      };
    } catch (err) {
      console.warn('[StoryExtractor] @sparticuz/chromium resolution warning:', err.message);
    }
  }

  // Local environment detection (Windows / macOS / Linux)
  const localCandidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : null,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  let localPath = null;
  for (const candidate of localCandidates) {
    try {
      if (fs.existsSync(candidate)) {
        localPath = candidate;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (localPath) {
    return {
      executablePath: localPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
      ],
      headless: 'new',
    };
  }

  // Fallback to @sparticuz/chromium if local Chrome not found
  try {
    const chromiumMod = await import('@sparticuz/chromium');
    const chromium = chromiumMod.default || chromiumMod;
    const executablePath = await chromium.executablePath();
    return {
      executablePath,
      args: chromium.args || ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    };
  } catch (err) {
    throw new Error(`Chromium executable could not be located in current environment: ${err.message}`);
  }
}

export function unwrapDirectCdnUrl(url) {
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

export function isInstagramCdn(url) {
  if (!url) return false;
  return url.includes('cdninstagram.com') || url.includes('fbcdn.net');
}

/**
 * Provider 1 (Primary): StorySaver.net
 * https://www.storysaver.net/en/
 */
async function extractViaStorySaver(page, username) {
  try {
    console.log(`[StoryExtractor] Trying provider: StorySaver (Primary) for @${username}`);
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
      if (hasResults > 0) break;
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

    console.log(`[StoryExtractor] Provider StorySaver returned ${stories.length} items`);
    return stories;
  } catch (err) {
    console.warn('[StoryExtractor] StorySaver error:', err.message);
    return [];
  }
}

/**
 * Provider 2 (Fallback 1): IGram.world
 * https://igram.world/en1/story-saver
 */
async function extractViaIGram(page, username) {
  try {
    console.log(`[StoryExtractor] Trying fallback: IGram.world for @${username}`);
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
      if (count > 0) break;
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

    console.log(`[StoryExtractor] Provider IGram.world returned ${stories.length} items`);
    return stories;
  } catch (err) {
    console.warn('[StoryExtractor] IGram.world error:', err.message);
    return [];
  }
}

/**
 * Provider 3 (Fallback 2): InstaSaver.io
 * https://instasaver.io/en/story-viewer/
 */
async function extractViaInstaSaver(page, username) {
  try {
    console.log(`[StoryExtractor] Trying fallback: InstaSaver.io for @${username}`);
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
      if (btnCount > 0) break;
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

    console.log(`[StoryExtractor] Provider InstaSaver.io returned ${stories.length} items`);
    return stories;
  } catch (err) {
    console.warn('[StoryExtractor] InstaSaver.io error:', err.message);
    return [];
  }
}

/**
 * Provider 4 (Fallback 3): InDown.io
 * https://indown.io/insta-stories-download
 */
async function extractViaInDown(page, username) {
  try {
    console.log(`[StoryExtractor] Trying fallback: InDown.io for @${username}`);
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
      if (count > 0) break;
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

    console.log(`[StoryExtractor] Provider InDown.io returned ${stories.length} items`);
    return stories;
  } catch (err) {
    console.warn('[StoryExtractor] InDown.io error:', err.message);
    return [];
  }
}

/**
 * Main Story Extraction Dispatcher with Resilient Multi-Provider Fallback Cascade
 */
export async function extractStoriesViaBrowser(usernameOrUrl) {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  console.log(`[StoryExtractor] Starting extraction for: ${usernameOrUrl}`);
  console.log(`[StoryExtractor] Environment: ${isVercel ? 'vercel/serverless' : 'local'}`);

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
    const config = await getChromiumConfig();
    browser = await puppeteer.launch({
      executablePath: config.executablePath,
      headless: config.headless,
      args: config.args,
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
      storiesList = await extractViaIGram(page, username);
    }

    // 3. Fallback 2: InstaSaver.io
    if (storiesList.length === 0) {
      storiesList = await extractViaInstaSaver(page, username);
    }

    // 4. Fallback 3: InDown.io
    if (storiesList.length === 0) {
      storiesList = await extractViaInDown(page, username);
    }

    // Prioritize targetStoryId if requested in the original link
    if (targetStoryId && storiesList.length > 1) {
      const matchIdx = storiesList.findIndex(
        (s) => (s.url && s.url.includes(targetStoryId)) || (s.thumbnail && s.thumbnail.includes(targetStoryId))
      );
      if (matchIdx > 0) {
        const matched = storiesList.splice(matchIdx, 1)[0];
        storiesList.unshift(matched);
      }
    }

    console.log(`[StoryExtractor] Final story count: ${storiesList.length} for @${username}`);

    return {
      success: true,
      username,
      count: storiesList.length,
      stories: storiesList,
    };
  } catch (err) {
    console.error('[StoryExtractor] Cascade Error:', err.message);
    return { success: false, error: 'FETCH_FAILED', message: err.message };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn('[StoryExtractor] Browser close warning:', closeErr.message);
      }
    }
  }
}
