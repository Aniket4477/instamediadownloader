import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

const YTDLP_BIN =
  process.env.YTDLP_PATH ||
  'C:\\Users\\anike\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';

// ─── yt-dlp: best for videos/reels ──────────────────────────────────────────

function ytdlpJson(url) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-single-json', '--no-playlist', '--quiet', url];
    const proc = spawn(YTDLP_BIN, args, { shell: false });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (e) => reject(new Error(`yt-dlp spawn error: ${e.message}`)));
    proc.on('close', () => {
      if (!stdout.trim()) return reject(new Error(stderr.trim() || 'yt-dlp: no output'));
      try { resolve(JSON.parse(stdout.trim())); }
      catch { reject(new Error('Failed to parse yt-dlp JSON')); }
    });
  });
}

// ─── oEmbed: official Instagram API — works for image posts ─────────────────

async function oembedFetch(postUrl) {
  const endpoint = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}`;
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  return res.json(); // { thumbnail_url, title, author_name, ... }
}

// ─── Validate URL ─────────────────────────────────────────────────────────────

function validateInstagramUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('instagram.com');
  } catch { return false; }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

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

    // ── Step 1: Try yt-dlp (handles reels/videos reliably) ───────────────────
    try {
      const info = await ytdlpJson(url);

      if (info.url) {
        // Success — it's a downloadable video
        return NextResponse.json({
          type: 'video',
          videoUrl: info.url,
          imageUrl: info.thumbnail || null,
          thumbnail: info.thumbnail || null,
          title: info.title || '',
          duration: info.duration || null,
        });
      }
    } catch (ytErr) {
      const msg = (ytErr.message || '').toLowerCase();

      // Hard fail: private or login required
      if (msg.includes('login required') || msg.includes('private')) {
        return NextResponse.json(
          { error: 'This post is private or requires login.' },
          { status: 403 }
        );
      }
      // "No video formats found" or similar → it's an image post → try oEmbed
      console.warn('[download] yt-dlp failed, trying oEmbed fallback:', ytErr.message);
    }

    // ── Step 2: oEmbed fallback — works for public image posts/carousels ──────
    try {
      const oembed = await oembedFetch(url);
      if (oembed.thumbnail_url) {
        return NextResponse.json({
          type: 'image',
          videoUrl: null,
          imageUrl: oembed.thumbnail_url,
          thumbnail: oembed.thumbnail_url,
          title: oembed.title || '',
          duration: null,
          author: oembed.author_name || '',
        });
      }
    } catch (oembedErr) {
      console.error('[download] oEmbed failed:', oembedErr.message);
    }

    // ── Nothing worked ────────────────────────────────────────────────────────
    return NextResponse.json(
      { error: 'Could not find media. The post may be private or removed.' },
      { status: 404 }
    );
  } catch (error) {
    console.error('[download] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
