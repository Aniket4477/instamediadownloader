import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { extractStoriesViaBrowser } from './storyExtractor';

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
    const url = (body?.url || '').trim();

    if (!url) {
      return NextResponse.json({ error: 'Instagram URL or handle is required' }, { status: 400 });
    }
    if (!validateInstagramUrl(url)) {
      return NextResponse.json({ error: 'Invalid Instagram URL or handle' }, { status: 400 });
    }

    const isStory = url.includes('/stories/') || url.startsWith('@') || !url.startsWith('http');

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

    // ── CASE B: Reels / Video Posts via yt-dlp ────────────────────────────────
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

    const stderrLow = stderr.toLowerCase();
    if (stderrLow.includes('login required') || stderrLow.includes('private video')) {
      return NextResponse.json(
        { error: 'This post is private or requires login. Only public content can be downloaded.' },
        { status: 403 }
      );
    }

    // ── CASE C: Multi-Photo Carousel or Single Photo ──────────────────────────
    const { stderr: stderr2 } = await runYtdlpCarousel(url);
    const allStderr = stderr + '\n' + stderr2;
    const shortcodes = parseShortcodesFromStderr(allStderr);

    if (shortcodes.length === 0) {
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
            images: [{ url: oembed.thumbnail_url, thumbnail: oembed.thumbnail_url }],
            count: 1,
          });
        }
      } catch (err) {
        console.error('[oEmbed Single Post Error]:', err.message);
      }

      return NextResponse.json(
        { error: 'Could not extract media. Please verify the link is public.' },
        { status: 404 }
      );
    }

    // Multi-Photo Carousel
    const results = await Promise.allSettled(
      shortcodes.map((sc) => oembedFetch(sc))
    );

    const images = results
      .filter((r) => r.status === 'fulfilled' && r.value?.thumbnail_url)
      .map((r) => ({
        url: r.value.thumbnail_url,
        thumbnail: r.value.thumbnail_url,
        title: r.value.title || '',
      }));

    if (images.length === 0) {
      return NextResponse.json(
        { error: 'Could not load photos from this post.' },
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
