const puppeteer = require('puppeteer-core');

const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Strategy 1: InDown Exact Story URL Extractor
 */
async function extractViaInDown(page, exactStoryUrl) {
  try {
    console.log(`[Story] InDown extracting exact story: ${exactStoryUrl}`);
    await page.goto('https://indown.io/insta-stories-download', { waitUntil: 'networkidle2', timeout: 20000 });

    await page.waitForSelector('#link', { timeout: 8000 });
    await page.type('#link', exactStoryUrl, { delay: 15 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 18000 }).catch(() => {}),
      page.click('button.btn.btn-primary.link-area')
    ]);

    const result = await page.evaluate(() => {
      const stories = [];
      const seen = new Set();

      // Look for video element on the result page
      const videos = document.querySelectorAll('video, video source');
      videos.forEach((v) => {
        const src = v.src;
        if (src && src.startsWith('http') && !seen.has(src)) {
          seen.add(src);
          stories.push({ type: 'video', url: src });
        }
      });

      // Look for direct download links
      const links = document.querySelectorAll('a[href*="cdninstagram"], a[href*="fbcdn"]');
      links.forEach((a) => {
        const href = a.href;
        if (href && href.startsWith('http')) {
          // Normalize URL to base path to prevent duplicate server links
          const cleanUrl = href.replace(/[?&]dl=1/, '');
          if (!seen.has(cleanUrl) && !seen.has(href)) {
            seen.add(cleanUrl);
            seen.add(href);
            const isVid = href.includes('.mp4') || href.includes('vencode_tag') || a.innerText.toLowerCase().includes('video') || a.innerText.toLowerCase().includes('server');
            stories.push({
              type: isVid ? 'video' : 'image',
              url: href,
            });
          }
        }
      });

      // Look for photo results
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

    // If multiple duplicate links to the same video were extracted, keep the highest quality one
    if (result.length > 1 && result.every((s) => s.type === 'video')) {
      return [result[0]];
    }

    return result;
  } catch (err) {
    console.warn('[Story InDown Strategy Error]:', err.message);
    return [];
  }
}

/**
 * Strategy 2: StoriesIG Profile/Story Extractor
 */
async function extractViaStoriesIG(page, username) {
  try {
    console.log(`[Story] StoriesIG extracting for @${username}`);
    await page.goto('https://storiesig.info/en/', { waitUntil: 'networkidle2', timeout: 20000 });

    const inputSelector = 'input.search-form__input';
    await page.waitForSelector(inputSelector, { timeout: 8000 });
    await page.click(inputSelector);
    await page.type(inputSelector, username, { delay: 25 });

    const btnSelector = 'button.search-form__button';
    await page.click(btnSelector);

    await new Promise((r) => setTimeout(r, 7000));

    const extracted = await page.evaluate(() => {
      const stories = [];
      const seen = new Set();
      const links = document.querySelectorAll('a[href*="storiesig.info/get"], a[href*="fbcdn"], a[href*="cdninstagram"], a.btn-download');
      
      links.forEach((a) => {
        const href = a.href || a.getAttribute('href');
        if (href && href.startsWith('http') && !seen.has(href)) {
          seen.add(href);
          const isVid = href.includes('.mp4') || (a.innerText && a.innerText.toLowerCase().includes('video'));
          stories.push({
            type: isVid ? 'video' : 'image',
            url: href,
          });
        }
      });

      return stories;
    });

    return extracted;
  } catch (err) {
    console.warn('[Story StoriesIG Strategy Error]:', err.message);
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

    // ── 1. If exact story link provided, prioritize InDown exact extractor ───
    if (cleanInput.includes('instagram.com/stories/')) {
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

    // ── 2. Fallback to StoriesIG ─────────────────────────────────────────────
    const storiesIgList = await extractViaStoriesIG(page, username);
    if (storiesIgList.length > 0) {
      return {
        success: true,
        username,
        count: storiesIgList.length,
        stories: storiesIgList,
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
};
