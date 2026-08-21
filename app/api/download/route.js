import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

const YTDLP_BIN =
  process.env.YTDLP_PATH ||
  'C:\\Users\\anike\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';

/**
 * Executes self-hosted yt-dlp to extract video metadata
 */
function runYtdlp(url, args = []) {
  return new Promise((resolve) => {
    const proc = spawn(
      YTDLP_BIN,
      ['--ignore-errors', '--no-playlist', '--quiet', '--no-warnings', ...args, url],
      { shell: false }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
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

/**
 * Runs yt-dlp with flat playlist to trigger per-item shortcodes in stderr for carousels
 */
function runYtdlpCarousel(url) {
  return new Promise((resolve) => {
    const proc = spawn(
      YTDLP_BIN,
      ['--ignore-errors', '--flat-playlist', '--quiet', url],
      { shell: false }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
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

function parseShortcodesFromStderr(stderr) {
  const matches = [...stderr.matchAll(/\[Instagram\]\s+([A-Za-z0-9_-]+):/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

/**
 * Public Instagram oEmbed fetch (Preserves original signed CDN URLs)
 */
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

function validateInstagramUrl(url) {
  try {
    return new URL(url).hostname.includes('instagram.com');
  } catch { return false; }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const url = (body?.url || '').trim();

    if (!url) {
      return NextResponse.json({ error: 'Instagram URL is required' }, { status: 400 });
    }
    if (!validateInstagramUrl(url)) {
      return NextResponse.json({ error: 'Invalid Instagram URL' }, { status: 400 });
    }

    // ── STEP 1: Check if it's a Video / Reel via self-hosted yt-dlp ──────
    const { info, stderr } = await runYtdlp(url, ['--dump-single-json']);

    if (info?.url) {
      return NextResponse.json({
        success: true,
        type: 'video',
        videoUrl: info.url,
        imageUrl: info.thumbnail || null,
        thumbnail: info.thumbnail || null,
        title: info.title || 'Instagram Video',
        author: info.uploader || info.channel || info.uploader_id || '',
        duration: info.duration || null,
        images: null,
        count: 1,
      });
    }

    // Check for explicit private post or login blocks
    const stderrLow = stderr.toLowerCase();
    if (stderrLow.includes('login required') || stderrLow.includes('private video')) {
      return NextResponse.json(
        { error: 'This post is private or requires login. Only public posts can be downloaded.' },
        { status: 403 }
      );
    }

    // ── STEP 2: Multi-photo Carousel or Single Image Post ────────────────
    const { stderr: stderr2 } = await runYtdlpCarousel(url);
    const allStderr = stderr + '\n' + stderr2;
    const shortcodes = parseShortcodesFromStderr(allStderr);

    // Case A: Single Image Post
    if (shortcodes.length === 0) {
      try {
        const oembed = await oembedFetch(url);
        if (oembed.thumbnail_url) {
          const imageUrl = oembed.thumbnail_url; // keep valid cryptographic signature
          return NextResponse.json({
            success: true,
            type: 'image',
            videoUrl: null,
            imageUrl,
            thumbnail: imageUrl,
            title: oembed.title || 'Instagram Photo',
            author: oembed.author_name || '',
            images: [{ url: imageUrl, thumbnail: imageUrl }],
            count: 1,
          });
        }
      } catch (err) {
        console.error('[oEmbed Single Post Error]:', err.message);
      }

      return NextResponse.json(
        { error: 'Could not extract media. Please verify the link is a public Instagram Post or Reel.' },
        { status: 404 }
      );
    }

    // Case B: Multi-Photo Carousel Post
    const results = await Promise.allSettled(
      shortcodes.map((sc) => oembedFetch(sc))
    );

    const images = results
      .filter((r) => r.status === 'fulfilled' && r.value?.thumbnail_url)
      .map((r) => {
        const validUrl = r.value.thumbnail_url;
        return { url: validUrl, thumbnail: validUrl, title: r.value.title || '' };
      });

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Could not load photos from this carousel post.' },
        { status: 404 }
      );
    }

    const firstOembed = results.find(
      (r) => r.status === 'fulfilled' && r.value?.author_name
    )?.value;

    return NextResponse.json({
      success: true,
      type: images.length === 1 ? 'image' : 'carousel',
      videoUrl: null,
      imageUrl: images[0].url,
      thumbnail: images[0].url,
      title: firstOembed?.title || 'Instagram Carousel Post',
      author: firstOembed?.author_name || '',
      images,
      count: images.length,
    });

  } catch (error) {
    console.error('[Download API Error]:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing request' },
      { status: 500 }
    );
  }
}
