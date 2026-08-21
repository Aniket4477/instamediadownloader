const puppeteer = require('puppeteer-core');

const CHROME_PATH =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

/**
 * Extracts public stories by automating search in headless Chrome.
 * 
 * @param {string} usernameOrUrl 
 * @returns {Promise<{ success: boolean, username: string, count: number, stories: Array<{ type: string, url: string, thumbnail?: string }> }>}
 */
async function extractStoriesViaBrowser(usernameOrUrl) {
  let cleanQuery = usernameOrUrl.trim();

  // Extract username if URL is passed
  if (cleanQuery.includes('instagram.com/stories/')) {
    const match = cleanQuery.match(/instagram\.com\/stories\/([^/?#]+)/i);
    if (match) cleanQuery = match[1];
  } else if (cleanQuery.includes('instagram.com/')) {
    const match = cleanQuery.match(/instagram\.com\/([^/?#]+)/i);
    if (match && !['p', 'reel', 'reels', 'tv'].includes(match[1].toLowerCase())) {
      cleanQuery = match[1];
    }
  }

  cleanQuery = cleanQuery.replace(/^@/, '');

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

    // ── Navigate to StoriesIG ────────────────────────────────────────────────
    await page.goto('https://storiesig.info/en/', { waitUntil: 'networkidle2', timeout: 25000 });

    const inputSelector = 'input.search-form__input';
    await page.waitForSelector(inputSelector, { timeout: 8000 });
    await page.click(inputSelector);
    await page.type(inputSelector, cleanQuery, { delay: 30 });

    const btnSelector = 'button.search-form__button';
    await page.click(btnSelector);

    // Wait for AJAX cards / media elements to render
    await new Promise((r) => setTimeout(r, 7000));

    const extracted = await page.evaluate(() => {
      const stories = [];

      // Scan all story cards & download anchors
      const links = document.querySelectorAll('a[href*="storiesig.info/get"], a[href*="fbcdn"], a[href*="cdninstagram"], a.btn-download');
      links.forEach((a) => {
        const href = a.href || a.getAttribute('href');
        if (href && href.startsWith('http')) {
          const isVid = href.includes('.mp4') || (a.innerText && a.innerText.toLowerCase().includes('video'));
          if (!stories.some((s) => s.url === href)) {
            stories.push({
              type: isVid ? 'video' : 'image',
              url: href,
            });
          }
        }
      });

      // Scan img tags if links weren't found
      if (stories.length === 0) {
        const imgs = document.querySelectorAll('.story-item img, .download-item img, article img');
        imgs.forEach((img) => {
          if (img.src && img.src.startsWith('http') && !img.src.includes('data:image') && !img.src.includes('logo')) {
            stories.push({
              type: 'image',
              url: img.src,
            });
          }
        });
      }

      // Check specific error containers (avoid matching FAQ footer text)
      const errorBoxes = [...document.querySelectorAll('.alert, .error, .text-danger, .search-result__error, .not-found')];
      const errorText = errorBoxes.map((el) => el.innerText.toLowerCase()).join(' ');
      const isPrivate = errorText.includes('private') || errorText.includes('is private');
      const notFound = errorText.includes('not found') || errorText.includes('does not exist');

      return { stories, isPrivate, notFound };
    });

    // If stories were found, return them directly
    if (extracted.stories.length > 0) {
      return {
        success: true,
        username: cleanQuery,
        count: extracted.stories.length,
        stories: extracted.stories,
      };
    }

    if (extracted.isPrivate) {
      return { success: false, error: 'PRIVATE_ACCOUNT', message: 'This Instagram account is private.' };
    }

    if (extracted.notFound) {
      return { success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Instagram account was not found.' };
    }

    return {
      success: true,
      username: cleanQuery,
      count: 0,
      stories: [],
    };
  } catch (err) {
    console.error('[Story Browser Extractor Error]:', err.message);
    return { success: false, error: 'FETCH_FAILED', message: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  extractStoriesViaBrowser,
};
