const puppeteer = require('puppeteer-core');

const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function unwrapDirectCdnUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    if (url.includes('storiesig.info/get') || url.includes('anonyig.com/get')) {
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
    // fallback to original
  }
  return url;
}

/**
 * Strategy 1: InDown Exact Story URL Extractor (for https://www.instagram.com/stories/username/id)
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

      // Look for video elements on the result page
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

    const unwrapped = result.map((s) => ({
      ...s,
      url: unwrapDirectCdnUrl(s.url),
    }));

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
 * Strategy 2: StoriesIG Username Multi-Stories Extractor
 */
async function extractViaStoriesIG(page, username) {
  try {
    console.log(`[Story] StoriesIG extracting all stories for @${username}`);
    await page.goto('https://storiesig.info/en/', { waitUntil: 'networkidle2', timeout: 20000 });

    const inputSelector = 'input.search-form__input';
    await page.waitForSelector(inputSelector, { timeout: 8000 });
    await page.click(inputSelector);
    await page.type(inputSelector, username, { delay: 25 });

    const btnSelector = 'button.search-form__button';
    await page.click(btnSelector);

    // Wait for profile & tabs to render
    await new Promise((r) => setTimeout(r, 7000));

    // Explicitly click the "STORIES" tab button
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('button.tabs-component__button, .tabs-component__button, button')];
      const storyBtn = tabs.find((b) => b.innerText && b.innerText.trim().toUpperCase() === 'STORIES');
      if (storyBtn) storyBtn.click();
    });

    await new Promise((r) => setTimeout(r, 3500));

    // Click story card buttons to trigger video stream / download link generation
    await page.evaluate(() => {
      const storyBtns = document.querySelectorAll('.media-content--story button, .media-content--story, [data-type="story"]');
      storyBtns.forEach((b) => b.click());
    });

    await new Promise((r) => setTimeout(r, 3000));

    const extracted = await page.evaluate(() => {
      const stories = [];
      const seen = new Set();

      // Check all download links in the active stories panel
      const downloadLinks = document.querySelectorAll(
        '.tabs-component__panel:not([style*="display: none"]) a[href*="storiesig.info/get"], a[href*=".mp4"], .media-content--story a'
      );

      downloadLinks.forEach((a) => {
        const href = a.href || a.getAttribute('href');
        if (href && href.startsWith('http') && !seen.has(href)) {
          seen.add(href);
          const isVid = href.includes('.mp4') || href.includes('filename=AQ') || (a.innerText && a.innerText.toLowerCase().includes('video'));
          stories.push({
            type: isVid ? 'video' : 'image',
            url: href,
          });
        }
      });

      // If links were not present, fallback to story cards & images
      if (stories.length === 0) {
        const storyCards = document.querySelectorAll(
          '.media-content--story, [data-type="story"], .stories-item, .tabs-component__panel:not([style*="display: none"]) .media-content'
        );

        storyCards.forEach((card) => {
          if (card.classList.contains('media-content--post') || card.closest('.media-content--post')) {
            return;
          }

          const dlLink = card.querySelector('a[href*="storiesig.info/get"], a[href*="fbcdn"], a[href*="cdninstagram"], a.btn-download');
          const video = card.querySelector('video, video source');
          const img = card.querySelector('img');

          const videoUrl = video?.src || (dlLink && dlLink.href.includes('.mp4') ? dlLink.href : null);
          const imageUrl = dlLink?.href || img?.src;

          if (videoUrl && !seen.has(videoUrl)) {
            seen.add(videoUrl);
            stories.push({
              type: 'video',
              url: videoUrl,
              thumbnail: img?.src || undefined,
            });
          } else if (imageUrl && !seen.has(imageUrl)) {
            seen.add(imageUrl);
            stories.push({
              type: 'image',
              url: imageUrl,
              thumbnail: imageUrl,
            });
          }
        });
      }

      return stories;
    });

    const unwrapped = extracted.map((s) => ({
      ...s,
      url: unwrapDirectCdnUrl(s.url),
      thumbnail: unwrapDirectCdnUrl(s.thumbnail),
    }));

    return unwrapped;
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

    // ── 2. For username queries or profile stories, extract ALL active stories 
    const storiesList = await extractViaStoriesIG(page, username);
    if (storiesList.length > 0) {
      return {
        success: true,
        username,
        count: storiesList.length,
        stories: storiesList,
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
