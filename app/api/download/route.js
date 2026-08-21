import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

// Binary path for yt-dlp (local script path or system PATH in production)
const YTDLP_BIN =
  process.env.YTDLP_PATH ||
  'C:\\Users\\anike\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';

/**
 * Executes self-hosted yt-dlp to extract public Instagram Reel / Video metadata.
 * No login, no cookies, no API keys, no third-party subscriptions.
 */
function extractWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      url,
    ];

    const proc = spawn(YTDLP_BIN, args, { shell: false });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp process: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim());
          return resolve(data);
        } catch (e) {
          return reject(new Error('Failed to parse yt-dlp output JSON'));
        }
      }

      const errLower = stderr.toLowerCase();
      if (errLower.includes('no video formats found')) {
        return reject(new Error('NO_VIDEO_FOUND'));
      }
      if (errLower.includes('login required') || errLower.includes('private')) {
        return reject(new Error('PRIVATE_OR_LOGIN_REQUIRED'));
      }
      return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function validateInstagramUrl(url) {
  try {
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
      return NextResponse.json({ error: 'Instagram URL is required' }, { status: 400 });
    }

    if (!validateInstagramUrl(url)) {
      return NextResponse.json(
        { error: 'Please enter a valid Instagram URL (e.g. /reel/, /p/, /tv/)' },
        { status: 400 }
      );
    }

    try {
      const info = await extractWithYtDlp(url);

      if (!info || (!info.url && !info.formats)) {
        return NextResponse.json(
          { error: 'No downloadable video stream found for this link.' },
          { status: 404 }
        );
      }

      // Extract direct video URL (primary url or best format)
      let videoUrl = info.url;
      if (!videoUrl && Array.isArray(info.formats)) {
        const videoFormats = info.formats.filter(
          (f) => f.vcodec && f.vcodec !== 'none' && f.url
        );
        if (videoFormats.length > 0) {
          videoUrl = videoFormats[videoFormats.length - 1].url;
        }
      }

      const thumbnail = info.thumbnail || null;
      const title = info.title || info.description?.slice(0, 100) || 'Instagram Video';
      const author = info.uploader || info.channel || info.uploader_id || '';
      const duration = info.duration || null;

      return NextResponse.json({
        success: true,
        type: 'video',
        videoUrl,
        thumbnail,
        title,
        author,
        duration,
        sourceUrl: url,
      });
    } catch (err) {
      console.error('[API /api/download] Extraction error:', err.message);

      if (err.message === 'NO_VIDEO_FOUND') {
        return NextResponse.json(
          { error: 'No video found in this post. This endpoint is configured for Reels & Videos only.' },
          { status: 400 }
        );
      }

      if (err.message === 'PRIVATE_OR_LOGIN_REQUIRED') {
        return NextResponse.json(
          { error: 'This Reel/Post is private or requires login. Only public content can be downloaded.' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Could not extract video. Please check the URL and ensure the Reel is public.' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('[API /api/download] Internal error:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing request' },
      { status: 500 }
    );
  }
}
