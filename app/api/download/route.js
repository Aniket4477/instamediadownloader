import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

const YTDLP_BIN =
  process.env.YTDLP_PATH ||
  'C:\\Users\\anike\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';

// ─── yt-dlp runner ────────────────────────────────────────────────────────────
// Returns { info, stderr } — info may be null if yt-dlp failed.
function runYtdlp(url, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(
      YTDLP_BIN,
      ['--ignore-errors', '--no-playlist', '--quiet', ...args, url],
      { shell: false }
    );
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', () => resolve({ info: null, stderr }));
    proc.on('close', () => {
      let info = null;
      if (stdout.trim()) {
        try { info = JSON.parse(stdout.trim()); } catch { /* ignore */ }
      }
      resolve({ info, stderr });
    });
  });
}

// ─── yt-dlp for carousel: run with flat-playlist to get all entry shortcodes
// from stderr lines like: [Instagram] SHORTCODE: No video formats found
function runYtdlpCarousel(url) {
  return new Promise((resolve) => {
    const proc = spawn(
      YTDLP_BIN,
      ['--ignore-errors', '--flat-playlist', '--quiet', url],
      { shell: false }
    );
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', () => resolve({ info: null, stderr }));
    proc.on('close', () => {
      let info = null;
      if (stdout.trim()) {
        try { info = JSON.parse(stdout.trim()); } catch { /* ignore */ }
      }
      resolve({ info, stderr });
    });
  });
}

// Extract shortcodes from yt-dlp stderr lines:
// "ERROR: [Instagram] SHORTCODE: No video formats found"
function parseShortcodesFromStderr(stderr) {
  const matches = [...stderr.matchAll(/\[Instagram\]\s+([A-Za-z0-9_-]+):/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

// ─── Instagram oEmbed (official API) ──────────────────────────────────────────
async function oembedFetch(shortcodeOrUrl) {
  const postUrl = shortcodeOrUrl.startsWith('http')
    ? shortcodeOrUrl
    : `https://www.instagram.com/p/${shortcodeOrUrl}/`;
  const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}`;
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  return res.json();
}

// Upgrade compressed oEmbed thumbnail URL to highest available resolution.
// Instagram CDN: replace s640x640 → s1080x1080 and remove lossy flags.
function upgradeImageQuality(url) {
  if (!url) return url;
  return url
    .replace(/s\d+x\d+/g, 's1080x1080') // higher res
    .replace(/_sh[\d.]+/g, '')            // remove sharpening (avoid re-compression artefacts)
    .replace(/_tt\d+/g, '');              // remove transform tag
}

// ─── Validate URL ──────────────────────────────────────────────────────────────
function validateInstagramUrl(url) {
  try {
    return new URL(url).hostname.includes('instagram.com');
  } catch { return false; }
}

// ─── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const url = (body?.url || '').trim();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    if (!validateInstagramUrl(url)) {
      return NextResponse.json({ error: 'Invalid Instagram URL' }, { status: 400 });
    }

    // ── Step 1: Try yt-dlp for video/reel ──────────────────────────────────
    const { info, stderr } = await runYtdlp(url, ['--dump-single-json']);

    if (info?.url) {
      // It's a video/reel — return directly
      return NextResponse.json({
        type: 'video',
        videoUrl: info.url,
        imageUrl: info.thumbnail || null,
        thumbnail: info.thumbnail || null,
        title: info.title || '',
        duration: info.duration || null,
        images: null,
      });
    }

    // Check for hard auth errors
    const stderrLow = stderr.toLowerCase();
    if (stderrLow.includes('login required') || stderrLow.includes('private video')) {
      return NextResponse.json(
        { error: 'This post is private or requires login.' },
        { status: 403 }
      );
    }

    // ── Step 2: Image post — extract all shortcodes from stderr ───────────
    // Run again with flat-playlist to ensure all carousel entries hit stderr
    const { stderr: stderr2 } = await runYtdlpCarousel(url);
    const allStderr = stderr + '\n' + stderr2;
    const shortcodes = parseShortcodesFromStderr(allStderr);

    if (shortcodes.length === 0) {
      // Fallback: just oEmbed the main URL (single image post)
      try {
        const oembed = await oembedFetch(url);
        if (oembed.thumbnail_url) {
          const imageUrl = upgradeImageQuality(oembed.thumbnail_url);
          return NextResponse.json({
            type: 'image',
            videoUrl: null,
            imageUrl,
            thumbnail: imageUrl,
            title: oembed.title || '',
            author: oembed.author_name || '',
            images: [{ url: imageUrl, thumbnail: imageUrl }],
          });
        }
      } catch { /* fall through */ }

      return NextResponse.json(
        { error: 'Could not find media. The post may be private or removed.' },
        { status: 404 }
      );
    }

    // ── Step 3: oEmbed each individual image shortcode in parallel ─────────
    const results = await Promise.allSettled(
      shortcodes.map((sc) => oembedFetch(sc))
    );

    const images = results
      .filter((r) => r.status === 'fulfilled' && r.value?.thumbnail_url)
      .map((r) => {
        const hqUrl = upgradeImageQuality(r.value.thumbnail_url);
        return { url: hqUrl, thumbnail: hqUrl, title: r.value.title || '' };
      });

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Could not load images from this post.' },
        { status: 404 }
      );
    }

    // Get post-level metadata from first successful oEmbed
    const firstOembed = results.find(
      (r) => r.status === 'fulfilled' && r.value?.author_name
    )?.value;

    return NextResponse.json({
      type: images.length === 1 ? 'image' : 'carousel',
      videoUrl: null,
      imageUrl: images[0].url,
      thumbnail: images[0].url,
      title: firstOembed?.title || '',
      author: firstOembed?.author_name || '',
      images, // array of { url, thumbnail }
      count: images.length,
    });
  } catch (error) {
    console.error('[download] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
