const puppeteer = require('puppeteer-core');

const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function unwrapDirectCdnUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    if (url.includes('storiesig.info/get') || url.includes('anonyig.com/get') || url.includes('instasaver.io/api/media/proxy')) {
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
 * Strategy 1: InstaSaver Real-Time Story Extractor (Extracts ALL Active Public Stories)
 */
async function extractViaInstaSaver(page, username) {
  try {
    console.log(`[Story] InstaSaver extracting all active stories for @${username}`);

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

    await page.goto('https://instasaver.io/en/story-viewer/', { waitUntil: 'networkidle2', timeout: 25000 });

    const inputSelector = 'input[type="text"], input[name="url"], input[placeholder*="username"], input[placeholder*="Instagram"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
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

    // Wait for the stories cards to appear
    await new Promise((r) => setTimeout(r, 6500));

    // Get number of active story download buttons
    const btnCount = await page.evaluate(() => {
      return document.querySelectorAll('.grid button').length;
    });

    console.log(`[Story] InstaSaver found ${btnCount} active story items for @${username}`);

    // Click each download button sequentially to trigger the full HD video streams
    for (let i = 0; i < btnCount; i++) {
      await page.evaluate((idx) => {
        const btns = document.querySelectorAll('.grid button');
        if (btns[idx]) btns[idx].click();
      }, i);
      await new Promise((r) => setTimeout(r, 1800));
    }

    page.off('response', responseHandler);

    // Extract thumbnails and images from rendered cards
    const cardThumbnails = await page.evaluate(() => {
      const thumbs = [];
      const cards = document.querySelectorAll('.grid > div');
      cards.forEach((card) => {
        const img = card.querySelector('img');
        if (img?.src) thumbs.push(img.src);
      });
      return thumbs;
    });

    const stories = [];
    const seen = new Set();

    // 1. Add all intercepted video streams
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

    // 2. If no video streams were triggered (e.g. photo stories), extract image cards
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

    console.log(`[Story] InstaSaver successfully extracted ${stories.length} stories for @${username}`);
    return stories;
  } catch (err) {
    console.warn('[Story InstaSaver Strategy Error]:', err.message);
    return [];
  }
}

/**
 * Strategy 2: InDown Exact Story URL Extractor (for https://www.instagram.com/stories/username/id)
 */
async function extractViaInDown(page, exactStoryUrl) {
  try {
    console.log(`[Story] InDown extracting exact story: ${exactStoryUrl}`);
    await page.goto('https://indown.io/insta-stories-download', { waitUntil: 'networkidle2', timeout: 20000 });

    await page.waitForSelector('#link', { timeout: 8000 });
    await page.type('#link', exactStoryUrl, { delay: 15 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 18000 }).catch(() => {}),
      page.click('button.btn.btn-primary.link-area'),
    ]);

    const result = await page.evaluate(() => {
      const stories = [];
      const seen = new Set();

      const videos = document.querySelectorAll('video, video source');
      videos.forEach((v) => {
        const src = v.src;
        if (src && src.startsWith('http') && !seen.has(src)) {
          seen.add(src);
          stories.push({ type: 'video', url: src });
        }
      });

      const links = document.querySelectorAll('a[href*="cdninstagram"], a[href*="fbcdn"]');
      links.forEach((a) => {
        const href = a.href;
        if (href && href.startsWith('http')) {
          const cleanUrl = href.replace(/[?&]dl=1/, '');
          if (!seen.has(cleanUrl) && !seen.has(href)) {
            seen.add(cleanUrl);
            seen.add(href);
            const isVid =
              href.includes('.mp4') ||
              href.includes('vencode_tag') ||
              a.innerText.toLowerCase().includes('video') ||
              a.innerText.toLowerCase().includes('server');
            stories.push({
              type: isVid ? 'video' : 'image',
              url: href,
            });
          }
        }
      });

      const images = document.querySelectorAll('.result img, .image-area img, .card img');
      images.forEach((img) => {
        const src = img.src;
        if (src && src.startsWith('http') && !src.includes('logo') && !seen.has(src)) {
          seen.add(src);
          stories.push({ type: 'image', url: src });
        }
      });

      return stories;
    });

    const unwrapped = result
      .map((s) => ({
        ...s,
        url: unwrapDirectCdnUrl(s.url),
      }))
      .filter((s) => isInstagramCdn(s.url));

    if (unwrapped.length > 1 && unwrapped.every((s) => s.type === 'video')) {
      return [unwrapped[0]];
    }

    return unwrapped;
  } catch (err) {
    console.warn('[Story InDown Strategy Error]:', err.message);
    return [];
  }
}

/**
 * Main Story Extraction Dispatcher
 */
async function extractStoriesViaBrowser(usernameOrUrl) {
  let cleanInput = usernameOrUrl.trim();
  let username = 'user';

  if (cleanInput.includes('instagram.com/stories/')) {
    const match = cleanInput.match(/instagram\.com\/stories\/([^/?#]+)/i);
    if (match) username = match[1];
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
        '--window-size=1280,900',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // ── 1. If exact story link with a specific ID is provided ───────────────
    if (cleanInput.includes('instagram.com/stories/') && cleanInput.split('/').filter(Boolean).length >= 5) {
      const inDownStories = await extractViaInDown(page, cleanInput);
      if (inDownStories.length > 0) {
        return {
          success: true,
          username,
          count: inDownStories.length,
          stories: inDownStories,
        };
      }
    }

    // ── 2. Primary Multi-Story Extractor via InstaSaver ──────────────────────
    const instaSaverStories = await extractViaInstaSaver(page, username);
    if (instaSaverStories.length > 0) {
      return {
        success: true,
        username,
        count: instaSaverStories.length,
        stories: instaSaverStories,
      };
    }

    return {
      success: true,
      username,
      count: 0,
      stories: [],
    };
  } catch (err) {
    console.error('[Story Extraction Error]:', err.message);
    return { success: false, error: 'FETCH_FAILED', message: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  extractStoriesViaBrowser,
  unwrapDirectCdnUrl,
};
