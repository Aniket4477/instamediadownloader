import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { extractStoriesViaBrowser, unwrapDirectCdnUrl, isInstagramCdn, getChromiumConfig } from './storyExtractor';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Cross-platform yt-dlp binary resolver.
 * On Linux (Vercel serverless): uses the bundled ./bin/yt-dlp binary downloaded during postinstall.
 * On Windows / macOS (local dev): falls back to system yt-dlp on PATH or YTDLP_PATH env.
 */
function resolveYtdlpBin() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  if (process.platform === 'linux') {
    // Vercel bundles files relative to process.cwd()
    const bundledPath = path.join(process.cwd(), 'bin', 'yt-dlp');
    if (fs.existsSync(bundledPath)) {
      try {
        fs.accessSync(bundledPath, fs.constants.X_OK);
        return bundledPath;
      } catch {
        // Not executable — try to fix permissions
        try { fs.chmodSync(bundledPath, 0o755); return bundledPath; } catch {}
      }
    }
  }
  return 'yt-dlp'; // fall back to system PATH
}
const YTDLP_BIN = resolveYtdlpBin();

/**
 * Executes yt-dlp if available on system, returning JSON metadata safely
 */
function runYtdlp(url, args = []) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(
        /*turbopackIgnore: true*/ YTDLP_BIN,
        ['--ignore-errors', '--no-playlist', '--quiet', '--no-warnings', ...args, url],
        { shell: false }
      );
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', (err) => {
        resolve({ info: null, stderr: err.message || 'yt-dlp not found' });
      });
      proc.on('close', () => {
        let info = null;
        if (stdout.trim()) {
          try { info = JSON.parse(stdout.trim()); } catch { /* ignore */ }
        }
        resolve({ info, stderr });
      });
    } catch (err) {
      resolve({ info: null, stderr: err.message });
    }
  });
}

/**
 * Parse ALL Instagram CDN media URLs from a raw HTML string.
 * Captures every image and video URL including full carousel items.
 */
function parseInstaCdnUrls(html) {
  const items = [];
  const seen = new Set();
  // Decode HTML entities first
  const decoded = html.replace(/&amp;/g, '&').replace(/&#038;/g, '&');

  // Video URLs first (priority)
  const videoRe = /https?:\/\/[a-z0-9.-]+\.cdninstagram\.com\/[^\s"'<>]+?\.mp4[^\s"'<>]*/gi;
  let m;
  while ((m = videoRe.exec(decoded)) !== null) {
    const url = m[0];
    if (!seen.has(url)) { seen.add(url); items.push({ type: 'video', url, thumbnail: url }); }
  }

  // Image URLs — scontent-*.cdninstagram.com or scontent-*.fbcdn.net
  const imgRe = /https?:\/\/scontent[a-z0-9.-]*\.(?:cdninstagram|fbcdn)\.com\/[^\s"'<>]+?\.(?:jpg|jpeg|png)[^\s"'<>]*/gi;
  while ((m = imgRe.exec(decoded)) !== null) {
    const url = m[0];
    if (!seen.has(url)) { seen.add(url); items.push({ type: 'image', url, thumbnail: url }); }
  }

  return items;
}

/**
 * Serverless-friendly carousel extractor — pure HTTP fetch, NO Puppeteer.
 * Tries multiple providers in sequence and returns ALL media items.
 * This is the primary path on Vercel since yt-dlp is not available.
 */
async function fetchCarouselDirect(postUrl) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const providers = [
    // Provider 1: cobalt.tools — open API with full carousel/picker support
    // Returns status=picker with ALL carousel items in one response.
    async () => {
      const res = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify({ url: postUrl, videoQuality: 'max', filenameStyle: 'pretty' }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      if (!data) return [];

      // status=picker means carousel — all items returned at once
      if (data.status === 'picker' && Array.isArray(data.picker) && data.picker.length > 0) {
        return data.picker.map((item) => ({
          type: item.type === 'video' ? 'video' : 'image',
          url: item.url,
          thumbnail: item.thumb || item.url,
        }));
      }
      // status=tunnel/redirect means single video/image
      if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
        const isVid = data.url.includes('.mp4') || (data.filename || '').endsWith('.mp4');
        return [{ type: isVid ? 'video' : 'image', url: data.url, thumbnail: data.url }];
      }
      return [];
    },

    // Provider 2: snapinsta.app — returns full carousel HTML with all CDN links
    async () => {
      const body = new URLSearchParams({ url: postUrl, lang: 'en' });
      const res = await fetch('https://snapinsta.app/action.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'Referer': 'https://snapinsta.app/',
          'Origin': 'https://snapinsta.app',
          'Accept': '*/*',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return [];
      return parseInstaCdnUrls(await res.text());
    },

    // Provider 3: snapsave.app — another HTML scraping alternative
    async () => {
      const body = new URLSearchParams({ url: postUrl, lang: 'en' });
      const res = await fetch('https://snapsave.app/action.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'Referer': 'https://snapsave.app/',
          'Origin': 'https://snapsave.app',
          'Accept': '*/*',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return [];
      return parseInstaCdnUrls(await res.text());
    },

    // Provider 4: igram.world direct API (no browser — uses the same convert API)
    async () => {
      const res = await fetch('https://igram.world/api/ig/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'Referer': 'https://igram.world/',
          'Origin': 'https://igram.world',
        },
        body: new URLSearchParams({ url: postUrl }).toString(),
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      if (!data) return [];
      const rawItems = data?.data || data?.url || data?.medias || [];
      return Array.isArray(rawItems)
        ? rawItems.map((item) => ({
            type: (item.type === 'mp4' || (item.url || '').includes('.mp4')) ? 'video' : 'image',
            url: item.url || item.download_url || '',
            thumbnail: item.thumbnail || item.url || '',
          })).filter((i) => i.url)
        : [];
    },
  ];

  for (const provider of providers) {
    try {
      const items = await provider();
      if (items.length > 0) {
        console.log(`[CarouselDirect] Got ${items.length} item(s)`);
        return items;
      }
    } catch (e) {
      console.warn('[CarouselDirect] Provider failed:', e.message);
    }
  }
  return [];
}

/**
 * Deduplicates CDN items while preserving all distinct photos/videos in a carousel
 */
function deduplicateMediaItems(items) {
  const seenIds = new Set();
  const uniqueList = [];

  for (const item of items) {
    const rawUrl = item.url;
    if (!rawUrl) continue;
    // Extract unique Instagram media ID if present
    const idMatch = rawUrl.match(/\/([0-9]+_[0-9]+_[0-9]+)/) || rawUrl.match(/\/([0-9a-zA-Z_-]+\.(?:jpg|jpeg|png|mp4))/i);
    const key = idMatch ? idMatch[1] : rawUrl.split('?')[0];

    if (!seenIds.has(key)) {
      seenIds.add(key);
      uniqueList.push(item);
    }
  }

  return uniqueList;
}

/**
 * Universal Serverless Browser Extractor for Instagram Posts, Carousels, and Reels
 * Extracts ALL available items in a carousel post preserving direct MP4 and image streams.
 */
/**
 * Universal Serverless Browser Extractor for Instagram Posts, Carousels, and Reels
 * Extracts ALL available items in a carousel post preserving direct MP4 and image streams.
 */
// ============================================================================
// GramScraper API Extractor (Primary - Fast, no Puppeteer, direct CDN URLs)
// API Key: GramScraper (gs_... token). Costs 1 credit per post lookup.
// ============================================================================
const GRAMSCRAPER_KEY =
  process.env.GRAMSCRAPER_KEY ||
  'gs_eyJzdWIiOiI0NjM2OGY3ZC0yZDM3LTQ1MjktOWYyNi0zMTc2NjVkZTYwZTAiLCJraWQiOiI5NGJjODg5Zi02MWM2LTQyNjAtYjk1OC0yZWEzZmRjZTc5NWYiLCJpYXQiOjE3OTE2NTYyODA4NjYsInYiOjJ9.xpJJVoC03bDvJc29oYAIHgGlTF4egQOXFrdOxrlUz8w';
const GRAMSCRAPER_BASE = 'https://gramscraper.com/api/instagram';

/**
 * Extract carousel/post/reel media via GramScraper REST API.
 * Returns array of { url, thumbnail, type, title, author } items, or [] on failure.
 * Fast (~1-2s), pure fetch, no browser required, directly returns Instagram CDN URLs.
 */
async function extractViaGramScraper(rawPostUrl) {
  try {
    const postUrl = rawPostUrl.split('?')[0].split('#')[0];
    const endpoint = `${GRAMSCRAPER_BASE}/v2/media/info/by/url?url=${encodeURIComponent(postUrl)}`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${GRAMSCRAPER_KEY}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[GramScraper] HTTP ${res.status} for ${postUrl}`);
      return [];
    }

    const data = await res.json();
    const post = data.media_or_ad || (Array.isArray(data.items) ? data.items[0] : null);
    if (!post) return [];

    const caption = post?.caption?.text || 'Instagram Post';
    const author = post?.user?.username || post?.user?.full_name || '';

    const items = [];

    // Helper to pick best resolution candidate
    const bestImage = (candidates) => {
      if (!Array.isArray(candidates) || candidates.length === 0) return null;
      return candidates.reduce((best, c) => (!best || c.width > best.width ? c : best), null);
    };

    const processItem = (item) => {
      if (!item) return;

      // Video (Reel or video carousel slide)
      if (item.video_versions && item.video_versions.length > 0) {
        const best = item.video_versions.reduce((b, v) => (!b || v.width > b.width ? v : b), null);
        if (best?.url) {
          const thumb = bestImage(item.image_versions2?.candidates)?.url || best.url;
          items.push({
            url: best.url,
            thumbnail: thumb,
            type: 'video',
            title: caption,
            author: author,
          });
          return;
        }
      }

      // Image (Carousel slide photo or single photo)
      if (item.image_versions2?.candidates && item.image_versions2.candidates.length > 0) {
        const best = bestImage(item.image_versions2.candidates);
        if (best?.url) {
          items.push({
            url: best.url,
            thumbnail: best.url,
            type: 'image',
            title: caption,
            author: author,
          });
          return;
        }
      }
    };

    // Check for carousel (multiple slides in carousel_media)
    if (Array.isArray(post.carousel_media) && post.carousel_media.length > 0) {
      for (const carouselItem of post.carousel_media) {
        processItem(carouselItem);
      }
    } else {
      // Single post or reel
      processItem(post);
    }

    console.log(`[GramScraper] Successfully extracted ${items.length} items for ${postUrl}`);
    return items;
  } catch (err) {
    console.warn('[GramScraper] Error:', err.message);
    return [];
  }
}

async function extractPostViaBrowser(rawPostUrl) {
  let browser;
  try {
    // Strip tracking parameters (?igsi=..., ?utm_source=...)
    const postUrl = rawPostUrl.split('?')[0].split('#')[0];
    const isReel = postUrl.includes('/reel/') || postUrl.includes('/tv/');

    const config = await getChromiumConfig();
    browser = await puppeteer.launch({
      executablePath: config.executablePath,
      headless: config.headless,
      args: config.args,
    });

    const providers = [
      {
        name: 'indown.io',
        url: isReel ? 'https://indown.io/reels' : 'https://indown.io/photo',
        input: '#link',
        submit: '#get',
        selector: 'a.btn-download, a[href*="cdninstagram"], a[href*="fetch"]',
        isFormNav: true,
      },
      {
        name: 'sssinstagram.com',
        url: 'https://sssinstagram.com/',
        input: '#main_input',
        submit: 'button[type="submit"]',
        selector: 'a.download_button, a[href*="get?"], a[href*="cdninstagram"]',
        isFormNav: false,
      },
    ];

    for (const prov of providers) {
      let page;
      try {
        console.log(`[PostExtractor] Trying ${prov.name} for: ${postUrl}`);
        page = await browser.newPage();
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });

        // 🚀 Abort ads, media, fonts & analytics for 10x faster execution
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const rt = req.resourceType();
          const u = req.url();
          if (
            rt === 'image' ||
            rt === 'font' ||
            rt === 'stylesheet' ||
            rt === 'media' ||
            u.includes('google') ||
            u.includes('doubleclick') ||
            u.includes('analytics') ||
            u.includes('pagead') ||
            u.includes('facebook') ||
            u.includes('amazon-adsystem')
          ) {
            req.abort();
          } else {
            req.continue();
          }
        });

        await page.goto(prov.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const input = await page.$(prov.input + ', input[name="url"], input[type="text"]');
        if (!input) {
          await page.close();
          continue;
        }

        await input.type(postUrl, { delay: 5 });

        if (prov.isFormNav) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 6000 }).catch(() => {}),
            page.evaluate((submitSel) => {
              const btn = document.querySelector(submitSel) || document.querySelector('button[type="submit"]');
              if (btn) btn.click();
            }, prov.submit),
          ]);
        } else {
          await page.evaluate((submitSel) => {
            const btn = document.querySelector(submitSel) || document.querySelector('button[type="submit"]');
            if (btn) btn.click();
          }, prov.submit);
        }

        // Wait up to 6s for results to appear
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, prov.selector);
            if (count > 0) break;
          } catch {
            // Ignore context destruction during active navigation
          }
        }

        // Add DOM elements (download buttons + rendered images)
        let rawDom = [];
        try {
          rawDom = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('a[href*="cdninstagram"], a.btn-download, a[href*="fetch"], a[href*="get?"], a[download]').forEach((a) => {
              const h = a.href;
              if (h && !h.includes('tiktok') && !h.includes('stories') && !h.includes('indown.io/photo') && !h.includes('indown.io/reels')) {
                links.push({ url: h, isVideo: h.includes('.mp4') || (a.innerText || '').toLowerCase().includes('video') });
              }
            });
            return links;
          });
        } catch (domErr) {
          console.warn(`[PostExtractor] DOM evaluation warning on ${prov.name}:`, domErr.message);
        }

        const rawItems = [];
        for (const item of rawDom) {
          const clean = unwrapDirectCdnUrl(item.url);
          if (isInstagramCdn(clean)) {
            rawItems.push({
              type: item.isVideo || clean.includes('.mp4') ? 'video' : 'image',
              url: clean,
              thumbnail: clean,
            });
          }
        }

        await page.close();

        const uniqueItems = deduplicateMediaItems(rawItems);
        if (uniqueItems.length > 0) {
          console.log(`[PostExtractor] Successfully extracted ${uniqueItems.length} items via ${prov.name}`);
          return uniqueItems;
        }
      } catch (provErr) {
        console.warn(`[PostExtractor] Provider ${prov.name} error:`, provErr.message);
        if (page) await page.close().catch(() => {});
      }
    }

    return [];
  } catch (err) {
    global.__lastExtractionError = err.message;
    console.error('[PostExtractor] Browser Extraction Error:', err.message);
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn('[PostExtractor] Browser close warning:', closeErr.message);
      }
    }
  }
}

/**
 * Public Instagram oEmbed Fetcher
 */
async function oembedFetch(shortcodeOrUrl) {
  const postUrl = shortcodeOrUrl.startsWith('http')
    ? shortcodeOrUrl
    : `https://www.instagram.com/p/${shortcodeOrUrl}/`;
  const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}`;
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  return res.json();
}

function validateInstagramUrl(url) {
  try {
    if (url.startsWith('@') || /^[a-zA-Z0-9._]{1,30}$/.test(url)) return true;
    const parsed = new URL(url);
    return parsed.hostname.includes('instagram.com');
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawInput = (body?.url || '').trim();

    if (!rawInput) {
      return NextResponse.json({ error: 'Instagram URL or handle is required' }, { status: 400 });
    }
    if (!validateInstagramUrl(rawInput)) {
      return NextResponse.json({ error: 'Invalid Instagram URL or handle' }, { status: 400 });
    }

    // Strip query strings (?igsi=..., ?utm_source=...) and hashes for maximum scraper compatibility
    const url = rawInput.startsWith('http') ? rawInput.split('?')[0].split('#')[0] : rawInput;

    const tab = (body?.tab || '').toLowerCase();

    // Check if input is a profile link (e.g. instagram.com/username or instagram.com/username/)
    const isProfileUrl = (() => {
      if (!url.startsWith('http')) return true;
      try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        return segments.length === 1 && !['p', 'reel', 'reels', 'tv', 'explore', 'stories'].includes(segments[0].toLowerCase());
      } catch {
        return false;
      }
    })();

    const isStory =
      tab === 'story' ||
      url.includes('/stories/') ||
      url.startsWith('@') ||
      !url.startsWith('http') ||
      isProfileUrl;

    // ── CASE A: Instagram Story Link or Username ──────────────────────────────
    if (isStory) {
      const storyRes = await extractStoriesViaBrowser(url);

      if (storyRes.success && storyRes.stories?.length > 0) {
        return NextResponse.json({
          success: true,
          type: 'story',
          username: storyRes.username,
          count: storyRes.stories.length,
          images: storyRes.stories.map((s) => ({
            url: s.url,
            thumbnail: s.thumbnail || s.url,
            type: s.type,
          })),
        });
      }

      if (storyRes.success && storyRes.stories?.length === 0) {
        return NextResponse.json(
          { error: 'No active stories found for this public account (stories expire in 24 hours).' },
          { status: 404 }
        );
      }

      if (storyRes.error === 'PRIVATE_ACCOUNT') {
        return NextResponse.json(
          { error: 'This account is private. Only public Stories can be downloaded.' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Unable to extract public stories for this account at this time.' },
        { status: 502 }
      );
    }

    // CASE B: GramScraper API (fast REST, no browser) ? Browser fallback
    const gsMedia = await extractViaGramScraper(url);
    const browserMedia = (gsMedia && gsMedia.length > 0) ? gsMedia : await extractPostViaBrowser(url);
    if (browserMedia && browserMedia.length > 0) {
      const isSingle = browserMedia.length === 1;
      const firstItem = browserMedia[0];

      return NextResponse.json({
        success: true,
        type: isSingle ? firstItem.type : 'carousel',
        videoUrl: isSingle && firstItem.type === 'video' ? firstItem.url : null,
        imageUrl: firstItem.thumbnail || firstItem.url,
        thumbnail: firstItem.thumbnail || firstItem.url,
        title: firstItem.title || 'Instagram Post',
        author: firstItem.author || '',
        images: browserMedia.map((m) => ({
          url: m.url,
          thumbnail: m.thumbnail || m.url,
          type: m.type,
        })),
        count: browserMedia.length,
      });
    }

    // ── CASE C: yt-dlp Extractor (Multi-entry or Video Reel) ───────────────────
    const { info, stderr } = await runYtdlp(url, ['--dump-single-json']);

    if (info) {
      // Multi-entry carousel from yt-dlp
      if (Array.isArray(info.entries) && info.entries.length > 0) {
        const validEntries = info.entries.filter((e) => e && (e.url || e.thumbnail));
        if (validEntries.length > 0) {
          const carouselImages = validEntries.map((e) => {
            const isVideo = e.vcodec !== 'none' || e.ext === 'mp4';
            const mediaUrl = e.url || e.thumbnail;
            return {
              url: mediaUrl,
              thumbnail: e.thumbnail || mediaUrl,
              type: isVideo ? 'video' : 'image',
            };
          });

          return NextResponse.json({
            success: true,
            type: carouselImages.length === 1 ? carouselImages[0].type : 'carousel',
            videoUrl: carouselImages[0].type === 'video' ? carouselImages[0].url : null,
            imageUrl: carouselImages[0].thumbnail,
            thumbnail: carouselImages[0].thumbnail,
            title: info.title || 'Instagram Post',
            author: info.uploader || info.channel || info.uploader_id || '',
            images: carouselImages,
            count: carouselImages.length,
          });
        }
      }

      // Single video / Reel
      if (info.url && (info.ext === 'mp4' || info.vcodec !== 'none' || url.includes('/reel/'))) {
        return NextResponse.json({
          success: true,
          type: 'video',
          videoUrl: info.url,
          imageUrl: info.thumbnail || null,
          thumbnail: info.thumbnail || null,
          title: info.title || 'Instagram Video',
          author: info.uploader || info.channel || info.uploader_id || '',
          duration: info.duration || null,
          images: [{ url: info.url, thumbnail: info.thumbnail || info.url, type: 'video' }],
          count: 1,
        });
      }
    }

    const stderrLow = (stderr || '').toLowerCase();
    if (stderrLow.includes('login required') || stderrLow.includes('private video')) {
      return NextResponse.json(
        { error: 'This post is private or requires login. Only public content can be downloaded.' },
        { status: 403 }
      );
    }

    // ── CASE D: Direct HTTP Carousel Extractor Fallback ─────────────────────────
    const directMedia = await fetchCarouselDirect(url);
    if (directMedia.length > 0) {
      const isSingle = directMedia.length === 1;
      const firstItem = directMedia[0];
      return NextResponse.json({
        success: true,
        type: isSingle ? firstItem.type : 'carousel',
        videoUrl: isSingle && firstItem.type === 'video' ? firstItem.url : null,
        imageUrl: firstItem.thumbnail || firstItem.url,
        thumbnail: firstItem.thumbnail || firstItem.url,
        title: 'Instagram Post',
        author: '',
        images: directMedia.map((m) => ({
          url: m.url,
          thumbnail: m.thumbnail || m.url,
          type: m.type,
        })),
        count: directMedia.length,
      });
    }

    // ── CASE E: Single Photo Fallback via Instagram oEmbed ───────────────────
    try {
      const oembed = await oembedFetch(url);
      if (oembed.thumbnail_url) {
        return NextResponse.json({
          success: true,
          type: 'image',
          videoUrl: null,
          imageUrl: oembed.thumbnail_url,
          thumbnail: oembed.thumbnail_url,
          title: oembed.title || 'Instagram Photo',
          author: oembed.author_name || '',
          images: [{ url: oembed.thumbnail_url, thumbnail: oembed.thumbnail_url, type: 'image' }],
          count: 1,
        });
      }
    } catch (err) {
      console.warn('[oEmbed Post Error]:', err.message);
    }

    return NextResponse.json(
      {
        error: 'Could not extract media from this link. Please verify the post is public.',
        debug: {
          lastError: global.__lastExtractionError || null,
        }
      },
      { status: 404 }
    );

  } catch (error) {
    console.error('[API Route Download Exception]:', error.message);
    return NextResponse.json(
      { error: 'An unexpected error occurred while extracting media. Please try again later.', debug: error.message },
      { status: 500 }
    );
  }
}
