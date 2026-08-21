import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

/**
 * Runs yt-dlp --dump-json on the given URL and returns parsed JSON metadata.
 * yt-dlp is used for maximum reliability (Option C) vs fragile HTML scraping.
 */
function getMediaInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',       // Output media info as JSON, don't download
      '--no-playlist',     // Single item only
      '--quiet',           // Suppress progress output
      url,
    ];

    // Use full path since pip installs to user Scripts dir (not on PATH by default).
    // Falls back to bare 'yt-dlp' for VPS/production environments where it's global.
    const ytdlpBin = process.env.YTDLP_PATH ||
      'C:\\Users\\anike\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe';
    const proc = spawn(ytdlpBin, args, { shell: true });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }
      try {
        const info = JSON.parse(stdout.trim());
        resolve(info);
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`yt-dlp not found: ${err.message}`));
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
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!validateInstagramUrl(url.trim())) {
      return NextResponse.json({ error: 'Invalid Instagram URL' }, { status: 400 });
    }

    let info;
    try {
      info = await getMediaInfo(url.trim());
    } catch (err) {
      const msg = err.message || '';
      console.error('yt-dlp error:', msg);

      if (msg.includes('yt-dlp not found')) {
        return NextResponse.json(
          { error: 'yt-dlp is not installed on this server.' },
          { status: 500 }
        );
      }
      if (msg.includes('Private') || msg.includes('login required') || msg.includes('not available')) {
        return NextResponse.json(
          { error: 'This post is private or login is required to access it.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: 'Could not find media. The post may be private or removed.' },
        { status: 404 }
      );
    }

    // yt-dlp info object fields we care about
    const videoUrl = info.url || info.webpage_url || null;
    const thumbnail = info.thumbnail || null;
    const ext = info.ext || 'mp4';
    const isVideo = ext !== 'jpg' && ext !== 'jpeg' && ext !== 'png' && ext !== 'webp';

    // For image posts, yt-dlp puts the image URL in `url`
    const imageUrl = !isVideo ? videoUrl : thumbnail;
    const finalVideoUrl = isVideo ? videoUrl : null;

    if (!finalVideoUrl && !imageUrl) {
      return NextResponse.json(
        { error: 'Could not find media in this post.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      type: isVideo ? 'video' : 'image',
      videoUrl: finalVideoUrl,
      imageUrl,
      thumbnail,
      title: info.title || '',
      duration: info.duration || null,
    });

  } catch (error) {
    console.error('Download API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
