#!/usr/bin/env node
/**
 * scripts/download-ytdlp.js
 *
 * Downloads the standalone yt-dlp binary for Linux during `npm install`.
 * Runs only in a Linux environment (Vercel build, CI) to avoid downloading
 * a platform-incompatible binary on Windows / macOS developer machines.
 *
 * The binary is written to ./bin/yt-dlp and marked executable.
 * next.config.mjs includes ./bin/** in outputFileTracingIncludes so it is
 * bundled into Vercel's serverless function package.
 */

const os = require('os');
const fs = require('fs');
const https = require('https');
const path = require('path');

const platform = os.platform();

if (platform !== 'linux') {
  console.log(`[download-ytdlp] Skipping on ${platform} — yt-dlp binary not needed here.`);
  process.exit(0);
}

const projectRoot = path.resolve(__dirname, '..');
const binDir = path.join(projectRoot, 'bin');
const binPath = path.join(binDir, 'yt-dlp');

// Skip if already downloaded (cached build)
if (fs.existsSync(binPath)) {
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
    console.log('[download-ytdlp] yt-dlp binary already present and executable.');
    process.exit(0);
  } catch {
    // File exists but not executable — re-apply permissions and exit
    fs.chmodSync(binPath, 0o755);
    console.log('[download-ytdlp] yt-dlp binary permissions fixed.');
    process.exit(0);
  }
}

fs.mkdirSync(binDir, { recursive: true });

// yt-dlp stable release for Linux x86_64 (self-contained, no Python needed)
const RELEASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function httpsGet(url, cb) {
  https.get(url, { headers: { 'User-Agent': 'node.js' } }, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      httpsGet(res.headers.location, cb);
    } else {
      cb(res);
    }
  }).on('error', cb);
}

console.log('[download-ytdlp] Downloading yt-dlp Linux binary ...');

const tmpPath = binPath + '.tmp';
const file = fs.createWriteStream(tmpPath);

httpsGet(RELEASE_URL, (res) => {
  if (res instanceof Error) {
    console.error('[download-ytdlp] Network error:', res.message);
    process.exit(1);
  }
  if (res.statusCode !== 200) {
    console.error(`[download-ytdlp] HTTP ${res.statusCode}`);
    process.exit(1);
  }

  const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
  let downloaded = 0;

  res.on('data', (chunk) => {
    downloaded += chunk.length;
    if (totalBytes > 0) {
      const pct = Math.round((downloaded / totalBytes) * 100);
      process.stdout.write(`\r[download-ytdlp] ${pct}% (${Math.round(downloaded / 1024 / 1024)}MB / ${Math.round(totalBytes / 1024 / 1024)}MB)`);
    }
  });

  res.pipe(file);

  file.on('finish', () => {
    file.close(() => {
      try {
        fs.renameSync(tmpPath, binPath);
        fs.chmodSync(binPath, 0o755);
        console.log('\n[download-ytdlp] yt-dlp downloaded successfully.');
        process.exit(0);
      } catch (err) {
        console.error('\n[download-ytdlp] Failed to finalize binary:', err.message);
        process.exit(1);
      }
    });
  });

  file.on('error', (err) => {
    console.error('\n[download-ytdlp] Write error:', err.message);
    try { fs.unlinkSync(tmpPath); } catch {}
    process.exit(1);
  });
});
