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
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
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
      url.includes('fastdl.app/get') ||
      url.includes('media.fastdl.app/get') ||
      url.includes('sssinstagram.com/get') ||
      url.includes('media.sssinstagram.com/get') ||
      url.includes('igram.world/get') ||
      url.includes('storiesig.info/get') ||
      url.includes('anonyig.com/get') ||
      url.includes('instasaver.io/api/media/proxy')
    ) {
      const parsed = new URL(url);
      const innerUri = parsed.searchParams.get('uri');
      if (innerUri && innerUri.startsWith('http')) return decodeURIComponent(innerUri);
    }
    if (url.includes('indown.io/fetch') || url.includes('d4.indown.io/fetch') || url.includes('d3.indown.io/fetch')) {
      const parsed = new URL(url);
      const innerUrl = parsed.searchParams.get('url');
      if (innerUrl && innerUrl.startsWith('http')) return decodeURIComponent(innerUrl);
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
 * Provider 1 (Primary for Stories): InstaSaver.io with Direct Stories API Interception
 * Extracts ONLY genuine active 24-hour stories, completely avoiding timeline feed posts.
 */
async function extractViaInstaSaverPure(page, username) {
  let storiesResponse = null;
  const responseHandler = async (res) => {
    const u = res.url();
    if (u.includes('api/instagram/stories')) {
      try {
        const json = await res.json();
        if (json?.success && Array.isArray(json?.data)) {
          storiesResponse = json.data;
        }
      } catch {}
    }
  };

  page.on('response', responseHandler);

  try {
    console.log(`[StoryExtractor] Trying provider: InstaSaver (Primary) for @${username}`);
    await page.goto('https://instasaver.io/en/story-viewer/', { waitUntil: 'domcontentloaded', timeout: 10000 });

    const inputSelector = 'input[type="text"], input[placeholder*="username"], input[placeholder*="profile"]';
    await page.waitForSelector(inputSelector, { timeout: 5000 });
    await page.type(inputSelector, username, { delay: 10 });

    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const submitBtn = btns.find(
        (b) =>
          b.innerText &&
          (b.innerText.toLowerCase().includes('view') ||
            b.innerText.toLowerCase().includes('download') ||
            b.innerText.toLowerCase().includes('search'))
      );
      if (submitBtn) submitBtn.click();
    });

    for (let sec = 0; sec < 6; sec++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (storiesResponse) break;
    }
  } catch (err) {
    console.warn('[StoryExtractor] InstaSaver pure error:', err.message);
  } finally {
    page.off('response', responseHandler);
  }

  if (storiesResponse && Array.isArray(storiesResponse)) {
    const stories = [];
    for (const item of storiesResponse) {
      const isVideo = item.media_type === 2 || (item.video_versions && item.video_versions.length > 0);
      const rawUrl = isVideo ? item.video_versions?.[0]?.url : item.image_versions2?.candidates?.[0]?.url;
      const rawThumb = item.image_versions2?.candidates?.[0]?.url || rawUrl;
      const cleanUrl = unwrapDirectCdnUrl(rawUrl);
      const cleanThumb = unwrapDirectCdnUrl(rawThumb);

      if (cleanUrl) {
        stories.push({
          type: isVideo ? 'video' : 'image',
          url: cleanUrl,
          thumbnail: cleanThumb,
        });
      }
    }
    console.log(`[StoryExtractor] Provider InstaSaver returned ${stories.length} pure stories`);
    return stories;
  }

  return [];
}

/**
 * Provider 2 (Fallback 1): StorySaver.net
 * https://www.storysaver.net/en/
 */
async function extractViaStorySaver(page, username) {
  try {
    console.log(`[StoryExtractor] Trying provider: StorySaver for @${username}`);
    await page.goto('https://www.storysaver.net/en/', { waitUntil: 'domcontentloaded', timeout: 10000 });

    const input = await page.$('#text_url, input[name="text_username"], input[type="text"]');
    if (!input) return [];
    await input.type(username, { delay: 10 });

    await page.evaluate(() => {
      const btn = document.querySelector('#StoryButton, button.button, input[type="submit"], button[type="submit"]');
      if (btn) btn.click();
    });

    for (let sec = 0; sec < 6; sec++) {
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
 * Provider 3 (Fallback 2): IGram.world with Story-Only Filtering
 * Excludes feed posts (regular_photo/t51) and only includes genuine story items.
 */
async function extractViaIGram(page, username) {
  try {
    console.log(`[StoryExtractor] Trying fallback: IGram.world for @${username}`);
    await page.goto('https://igram.world/en1/story-saver', { waitUntil: 'domcontentloaded', timeout: 10000 });

    const input = await page.$('#search-form-input, input[name="url"], input[type="text"]');
    if (!input) return [];
    await input.type(username, { delay: 10 });

    await page.evaluate(() => {
      const btn = document.querySelector('button.search-form__button, button[type="submit"]');
      if (btn) btn.click();
    });

    for (let sec = 0; sec < 6; sec++) {
      await new Promise((r) => setTimeout(r, 1000));
      const count = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="igram.world/get"], a.button__download, a[download]').length;
      });
      if (count > 0) break;
    }

    const items = await page.evaluate(() => {
      const list = [];
      document.querySelectorAll('a[href*="igram.world/get"], a.button__download, a[download]').forEach((a) => {
        if (a.href) {
          const isVideo = (a.innerText || '').toLowerCase().includes('video') || a.href.includes('.mp4');
          list.push({ href: a.href, isVideo });
        }
      });
      return list;
    });

    const stories = [];
    const seen = new Set();
    for (const raw of items) {
      const clean = unwrapDirectCdnUrl(raw.href);
      const isTrueStory = clean.includes('/o1/') || clean.includes('ig_ephemeral') || clean.includes('STORY') || clean.includes('.mp4') || raw.isVideo;
      if (isInstagramCdn(clean) && isTrueStory && !seen.has(clean)) {
        seen.add(clean);
        stories.push({
          type: raw.isVideo || clean.includes('.mp4') ? 'video' : 'image',
          url: clean,
          thumbnail: clean,
        });
      }
    }

    console.log(`[StoryExtractor] Provider IGram.world returned ${stories.length} pure story items`);
    return stories;
  } catch (err) {
    console.warn('[StoryExtractor] IGram.world error:', err.message);
    return [];
  }
}

/**
 * Main Story Extraction Dispatcher with Pure Story Filtering Cascade
 */
export async function extractStoriesViaBrowser(usernameOrUrl) {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  console.log(`[StoryExtractor] Starting pure story extraction for: ${usernameOrUrl}`);
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
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    let storiesList = [];

    // 1. Primary: InstaSaver.io with pure story API interception (returns ONLY active stories)
    storiesList = await extractViaInstaSaverPure(page, username);

    // 2. Fallback 1: StorySaver.net
    if (storiesList.length === 0) {
      storiesList = await extractViaStorySaver(page, username);
    }

    // 3. Fallback 2: IGram.world with story-only URL filtering
    if (storiesList.length === 0) {
      storiesList = await extractViaIGram(page, username);
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

    console.log(`[StoryExtractor] Final pure story count: ${storiesList.length} for @${username}`);

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
